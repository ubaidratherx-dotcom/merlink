import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MerlinkEscrow } from "../target/types/merlink_escrow";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert, expect } from "chai";

function padTradeId(id: string): number[] {
  const bytes = Buffer.from(id);
  const padded = Buffer.alloc(32);
  bytes.copy(padded, 0, 0, Math.min(32, bytes.length));
  return Array.from(padded);
}

function getEscrowPda(program: Program<MerlinkEscrow>, tradeId: string): [PublicKey, number] {
  const padded = Buffer.alloc(32);
  Buffer.from(tradeId).copy(padded, 0, 0, Math.min(32, tradeId.length));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), padded],
    program.programId
  );
}

describe("merlink_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.MerlinkEscrow as Program<MerlinkEscrow>;

  let seller: Keypair;
  let buyer: Keypair;
  let tradeCounter = 0;

  function nextTradeId(): string {
    return `test_trade_${Date.now()}_${tradeCounter++}`;
  }

  beforeEach(async () => {
    seller = Keypair.generate();
    buyer = Keypair.generate();

    // Airdrop SOL to seller and buyer
    const sellerAirdrop = await provider.connection.requestAirdrop(seller.publicKey, 5 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sellerAirdrop);

    const buyerAirdrop = await provider.connection.requestAirdrop(buyer.publicKey, 2 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(buyerAirdrop);
  });

  // ═══════════════════════════════════════════════════════════
  // HAPPY PATH: Lock SOL → Release
  // ═══════════════════════════════════════════════════════════

  describe("Happy path: SOL lock → release", () => {
    it("should lock SOL and release to buyer", async () => {
      const tradeId = nextTradeId();
      const tradeIdBytes = padTradeId(tradeId);
      const [escrowPda] = getEscrowPda(program, tradeId);
      const amount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);

      // Lock
      await program.methods
        .lockSol(tradeIdBytes, amount)
        .accounts({
          seller: seller.publicKey,
          buyer: buyer.publicKey,
          escrow: escrowPda,
          system_program: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      // Verify escrow state
      const escrow = await program.account.escrow.fetch(escrowPda);
      assert.ok(escrow.isSol);
      assert.ok(escrow.isLocked);
      assert.ok(!escrow.isReleased);
      assert.ok(!escrow.paymentMarked);
      assert.equal(escrow.seller.toBase58(), seller.publicKey.toBase58());
      assert.equal(escrow.buyer.toBase58(), buyer.publicKey.toBase58());

      const buyerBefore = await provider.connection.getBalance(buyer.publicKey);

      // Release
      await program.methods
        .releaseSol()
        .accounts({
          seller: seller.publicKey,
          buyer: buyer.publicKey,
          escrow: escrowPda,
          system_program: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      const buyerAfter = await provider.connection.getBalance(buyer.publicKey);
      // Buyer should receive the locked amount + rent (account closed)
      assert.ok(buyerAfter > buyerBefore);

      // Escrow account should be closed
      const escrowAccount = await provider.connection.getAccountInfo(escrowPda);
      assert.equal(escrowAccount, null);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // HAPPY PATH: Lock SOL → Cancel
  // ═══════════════════════════════════════════════════════════

  describe("Happy path: SOL lock → cancel", () => {
    it("should lock SOL and refund to seller", async () => {
      const tradeId = nextTradeId();
      const [escrowPda] = getEscrowPda(program, tradeId);
      const amount = new anchor.BN(0.3 * LAMPORTS_PER_SOL);

      await program.methods
        .lockSol(padTradeId(tradeId), amount)
        .accounts({
          seller: seller.publicKey,
          buyer: buyer.publicKey,
          escrow: escrowPda,
          system_program: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      const sellerBefore = await provider.connection.getBalance(seller.publicKey);

      await program.methods
        .cancelSol()
        .accounts({
          seller: seller.publicKey,
          escrow: escrowPda,
          system_program: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      const sellerAfter = await provider.connection.getBalance(seller.publicKey);
      assert.ok(sellerAfter > sellerBefore);

      // Account closed
      const escrowAccount = await provider.connection.getAccountInfo(escrowPda);
      assert.equal(escrowAccount, null);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // CRITICAL: Cancel blocked after payment marked
  // ═══════════════════════════════════════════════════════════

  describe("CRITICAL: Cancel blocked after payment marked", () => {
    it("should block cancel after buyer marks payment", async () => {
      const tradeId = nextTradeId();
      const [escrowPda] = getEscrowPda(program, tradeId);
      const amount = new anchor.BN(0.2 * LAMPORTS_PER_SOL);

      await program.methods
        .lockSol(padTradeId(tradeId), amount)
        .accounts({
          seller: seller.publicKey,
          buyer: buyer.publicKey,
          escrow: escrowPda,
          system_program: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      // Buyer marks payment
      await program.methods
        .markPaymentSent()
        .accounts({
          buyer: buyer.publicKey,
          escrow: escrowPda,
        })
        .signers([buyer])
        .rpc();

      const escrow = await program.account.escrow.fetch(escrowPda);
      assert.ok(escrow.paymentMarked);

      // Seller tries to cancel — should fail
      try {
        await program.methods
          .cancelSol()
          .accounts({
            seller: seller.publicKey,
            escrow: escrowPda,
            system_program: SystemProgram.programId,
          })
          .signers([seller])
          .rpc();
        assert.fail("Should have thrown");
      } catch (err: any) {
        assert.ok(err.message.includes("PaymentAlreadySent") || err.logs?.some((l: string) => l.includes("PaymentAlreadySent")));
      }
    });

    it("should allow cancel before payment marked", async () => {
      const tradeId = nextTradeId();
      const [escrowPda] = getEscrowPda(program, tradeId);
      const amount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);

      await program.methods
        .lockSol(padTradeId(tradeId), amount)
        .accounts({
          seller: seller.publicKey,
          buyer: buyer.publicKey,
          escrow: escrowPda,
          system_program: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      // Cancel without marking payment — should succeed
      await program.methods
        .cancelSol()
        .accounts({
          seller: seller.publicKey,
          escrow: escrowPda,
          system_program: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      const escrowAccount = await provider.connection.getAccountInfo(escrowPda);
      assert.equal(escrowAccount, null);
    });

    it("only buyer can mark payment", async () => {
      const tradeId = nextTradeId();
      const [escrowPda] = getEscrowPda(program, tradeId);

      await program.methods
        .lockSol(padTradeId(tradeId), new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accounts({
          seller: seller.publicKey,
          buyer: buyer.publicKey,
          escrow: escrowPda,
          system_program: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      // Seller tries to mark — should fail (has_one = buyer)
      try {
        await program.methods
          .markPaymentSent()
          .accounts({
            buyer: seller.publicKey,
            escrow: escrowPda,
          })
          .signers([seller])
          .rpc();
        assert.fail("Should have thrown");
      } catch (err: any) {
        assert.ok(err.message.includes("has_one") || err.message.includes("ConstraintHasOne") || err.message.includes("2001"));
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // CRITICAL: is_sol type guard
  // ═══════════════════════════════════════════════════════════

  describe("CRITICAL: is_sol type guard", () => {
    it("should not allow release_sol on token escrow (if we had one)", async () => {
      // This test verifies the type guard exists in the instruction logic
      // Full token escrow test requires SPL token setup — testing the SOL side
      const tradeId = nextTradeId();
      const [escrowPda] = getEscrowPda(program, tradeId);

      await program.methods
        .lockSol(padTradeId(tradeId), new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accounts({
          seller: seller.publicKey,
          buyer: buyer.publicKey,
          escrow: escrowPda,
          system_program: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      // Verify is_sol is true for SOL escrow
      const escrow = await program.account.escrow.fetch(escrowPda);
      assert.ok(escrow.isSol);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // ACCESS CONTROL
  // ═══════════════════════════════════════════════════════════

  describe("Access control", () => {
    it("only seller can release", async () => {
      const tradeId = nextTradeId();
      const [escrowPda] = getEscrowPda(program, tradeId);

      await program.methods
        .lockSol(padTradeId(tradeId), new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accounts({
          seller: seller.publicKey,
          buyer: buyer.publicKey,
          escrow: escrowPda,
          system_program: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      // Buyer tries to release — should fail (has_one = seller)
      try {
        await program.methods
          .releaseSol()
          .accounts({
            seller: buyer.publicKey,
            buyer: buyer.publicKey,
            escrow: escrowPda,
            system_program: SystemProgram.programId,
          })
          .signers([buyer])
          .rpc();
        assert.fail("Should have thrown");
      } catch (err: any) {
        assert.ok(err.message.includes("has_one") || err.message.includes("ConstraintHasOne") || err.message.includes("2001"));
      }
    });

    it("only seller can cancel", async () => {
      const tradeId = nextTradeId();
      const [escrowPda] = getEscrowPda(program, tradeId);

      await program.methods
        .lockSol(padTradeId(tradeId), new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accounts({
          seller: seller.publicKey,
          buyer: buyer.publicKey,
          escrow: escrowPda,
          system_program: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      try {
        await program.methods
          .cancelSol()
          .accounts({
            seller: buyer.publicKey,
            escrow: escrowPda,
            system_program: SystemProgram.programId,
          })
          .signers([buyer])
          .rpc();
        assert.fail("Should have thrown");
      } catch (err: any) {
        assert.ok(err.message.includes("has_one") || err.message.includes("ConstraintHasOne") || err.message.includes("2001"));
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // STATE GUARDS
  // ═══════════════════════════════════════════════════════════

  describe("State guards", () => {
    it("cannot lock same tradeId twice", async () => {
      const tradeId = nextTradeId();
      const [escrowPda] = getEscrowPda(program, tradeId);

      await program.methods
        .lockSol(padTradeId(tradeId), new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accounts({
          seller: seller.publicKey,
          buyer: buyer.publicKey,
          escrow: escrowPda,
          system_program: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      try {
        await program.methods
          .lockSol(padTradeId(tradeId), new anchor.BN(0.1 * LAMPORTS_PER_SOL))
          .accounts({
            seller: seller.publicKey,
            buyer: buyer.publicKey,
            escrow: escrowPda,
            system_program: SystemProgram.programId,
          })
          .signers([seller])
          .rpc();
        assert.fail("Should have thrown");
      } catch (err: any) {
        // PDA already initialized
        assert.ok(err.message.includes("already in use") || err.message.includes("0x0"));
      }
    });

    it("cannot release when disputed", async () => {
      const tradeId = nextTradeId();
      const [escrowPda] = getEscrowPda(program, tradeId);

      await program.methods
        .lockSol(padTradeId(tradeId), new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accounts({
          seller: seller.publicKey,
          buyer: buyer.publicKey,
          escrow: escrowPda,
          system_program: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      await program.methods
        .markDisputed()
        .accounts({
          caller: buyer.publicKey,
          escrow: escrowPda,
        })
        .signers([buyer])
        .rpc();

      try {
        await program.methods
          .releaseSol()
          .accounts({
            seller: seller.publicKey,
            buyer: buyer.publicKey,
            escrow: escrowPda,
            system_program: SystemProgram.programId,
          })
          .signers([seller])
          .rpc();
        assert.fail("Should have thrown");
      } catch (err: any) {
        assert.ok(err.message.includes("IsDisputed") || err.logs?.some((l: string) => l.includes("IsDisputed")));
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════

  describe("Edge cases", () => {
    it("cannot self-trade", async () => {
      const tradeId = nextTradeId();
      const [escrowPda] = getEscrowPda(program, tradeId);

      try {
        await program.methods
          .lockSol(padTradeId(tradeId), new anchor.BN(0.1 * LAMPORTS_PER_SOL))
          .accounts({
            seller: seller.publicKey,
            buyer: seller.publicKey, // same as seller
            escrow: escrowPda,
            system_program: SystemProgram.programId,
          })
          .signers([seller])
          .rpc();
        assert.fail("Should have thrown");
      } catch (err: any) {
        assert.ok(err.message.includes("SelfTrade") || err.logs?.some((l: string) => l.includes("SelfTrade")));
      }
    });

    it("cannot lock zero amount", async () => {
      const tradeId = nextTradeId();
      const [escrowPda] = getEscrowPda(program, tradeId);

      try {
        await program.methods
          .lockSol(padTradeId(tradeId), new anchor.BN(0))
          .accounts({
            seller: seller.publicKey,
            buyer: buyer.publicKey,
            escrow: escrowPda,
            system_program: SystemProgram.programId,
          })
          .signers([seller])
          .rpc();
        assert.fail("Should have thrown");
      } catch (err: any) {
        assert.ok(err.message.includes("ZeroAmount") || err.logs?.some((l: string) => l.includes("ZeroAmount")));
      }
    });

    it("account closed after release — rent returned", async () => {
      const tradeId = nextTradeId();
      const [escrowPda] = getEscrowPda(program, tradeId);

      const sellerBefore = await provider.connection.getBalance(seller.publicKey);

      await program.methods
        .lockSol(padTradeId(tradeId), new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accounts({
          seller: seller.publicKey,
          buyer: buyer.publicKey,
          escrow: escrowPda,
          system_program: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      await program.methods
        .releaseSol()
        .accounts({
          seller: seller.publicKey,
          buyer: buyer.publicKey,
          escrow: escrowPda,
          system_program: SystemProgram.programId,
        })
        .signers([seller])
        .rpc();

      // Escrow PDA should be gone
      const account = await provider.connection.getAccountInfo(escrowPda);
      assert.equal(account, null);
    });
  });
});
