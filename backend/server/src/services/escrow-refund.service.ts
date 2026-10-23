/**
 * Server-side escrow auto-refund.
 * Called when a trade auto-cancels (payment deadline expired).
 * Simple logic: admin marks disputed → admin calls disputeCancel (ETH) / disputeCancelSol (SOL)
 */

// ─── ETH ────────────────────────────────────────────────

const ETH_ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ETH_ESCROW_ADDRESS || "0xea9ffa35b1030e895c096ea1993149376287D226";
const ETH_ADMIN_KEY = process.env.ETH_ADMIN_PRIVATE_KEY || "";
const ETH_RPC = process.env.ETH_RPC_URL || "https://rpc.sepolia.org";

const ETH_ABI = [
  "function markDisputed(bytes32 tradeId) external",
  "function disputeCancel(bytes32 tradeId) external",
  "function escrows(bytes32) view returns (address seller, address buyer, address token, uint256 amount, uint256 createdAt, bool isLocked, bool isReleased, bool isCancelled, bool isDisputed, bool paymentMarked)",
];

async function refundEth(tradeId: string): Promise<string | null> {
  if (!ETH_ADMIN_KEY) { console.error("[auto-refund] ETH_ADMIN_PRIVATE_KEY not set"); return null; }
  try {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(ETH_RPC);
    const wallet = new ethers.Wallet(ETH_ADMIN_KEY, provider);
    const contract = new ethers.Contract(ETH_ESCROW_ADDRESS, ETH_ABI, wallet);

    const utf8 = ethers.toUtf8Bytes(tradeId);
    const tid = ethers.zeroPadBytes(utf8.length > 32 ? utf8.slice(0, 32) : utf8, 32);

    const escrow = await contract.escrows(tid);
    if (!escrow.isLocked || escrow.isReleased || escrow.isCancelled) {
      console.log("[auto-refund] ETH escrow already resolved or never locked");
      return "no_escrow";
    }
    if (escrow.paymentMarked) {
      console.error("[auto-refund] ETH escrow has paymentMarked — skipping");
      return null; // genuinely unsafe, don't refund
    }

    if (!escrow.isDisputed) {
      const tx1 = await contract.markDisputed(tid);
      await tx1.wait();
      console.log("[auto-refund] ETH markDisputed done");
    }

    const tx2 = await contract.disputeCancel(tid);
    const receipt = await tx2.wait();
    console.log("[auto-refund] ETH disputeCancel done:", receipt.hash);
    return receipt.hash;
  } catch (err: any) {
    const msg = err.reason || err.message || "";
    if (msg.includes("Already cancelled") || msg.includes("Already released") || msg.includes("Not locked")) {
      console.log("[auto-refund] ETH escrow already resolved on-chain");
      return "no_escrow";
    }
    console.error("[auto-refund] ETH failed:", msg);
    return null;
  }
}

// ─── SOL ────────────────────────────────────────────────

const SOLANA_ADMIN_KEY = process.env.SOLANA_ADMIN_KEY || "";
const SOLANA_RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const ESCROW_PROGRAM_ID = process.env.ESCROW_PROGRAM_ID || "";

async function refundSol(tradeId: string, asset: string, sellerWallet: string, buyerWallet: string): Promise<string | null> {
  if (!SOLANA_ADMIN_KEY || !ESCROW_PROGRAM_ID) { console.error("[auto-refund] SOL missing keys"); return null; }
  try {
    const { Connection, Keypair, PublicKey } = await import("@solana/web3.js");
    const { Program, AnchorProvider, Wallet } = await import("@coral-xyz/anchor");
    const bs58 = await import("bs58");

    const connection = new Connection(SOLANA_RPC, "confirmed");
    const adminKp = Keypair.fromSecretKey(bs58.default.decode(SOLANA_ADMIN_KEY));
    const provider = new AnchorProvider(connection, new Wallet(adminKp), { commitment: "confirmed" });

    const programId = new PublicKey(ESCROW_PROGRAM_ID);
    // Must match frontend: trade ID zero-padded to 32 bytes
    const tradeIdBytes = new Uint8Array(32);
    tradeIdBytes.set(new TextEncoder().encode(tradeId).slice(0, 32));
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(tradeIdBytes)],
      programId
    );

    const info = await connection.getAccountInfo(escrowPda);
    if (!info) {
      console.log("[auto-refund] SOL escrow PDA not found — already closed or never created");
      return "no_escrow"; // safe to cancel DB
    }

    // Read seller/buyer from ON-CHAIN data (not DB — DB wallet may have changed)
    // Layout: 8 discriminator + 32 trade_id + 32 seller + 32 buyer
    const sellerPk = new PublicKey(info.data.slice(40, 72));
    const buyerPk = new PublicKey(info.data.slice(72, 104));

    const idl = await Program.fetchIdl(programId, provider);
    if (!idl) return null;
    const program = new Program(idl, provider);

    const { SystemProgram } = await import("@solana/web3.js");

    // Mark disputed first
    try {
      await program.methods.markDisputed()
        .accountsPartial({ caller: adminKp.publicKey, escrow: escrowPda })
        .signers([adminKp])
        .rpc();
      console.log("[auto-refund] SOL markDisputed done");
    } catch (e: any) {
      if (!e.message?.includes("Disputed") && !e.message?.includes("disputed")) throw e;
    }

    let txSig: string;
    if (asset === "SOL") {
      txSig = await program.methods.disputeCancelSol()
        .accountsPartial({
          admin: adminKp.publicKey,
          seller: sellerPk,
          buyer: buyerPk,
          escrow: escrowPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([adminKp])
        .rpc();
    } else {
      const { getAssociatedTokenAddress } = await import("@solana/spl-token");
      // Read mint from on-chain escrow data
      // Layout: 8 disc + 32 trade_id + 32 seller + 32 buyer + 8 amount + 1 is_sol = offset 113
      const mintPk = new PublicKey(info.data.slice(113, 145));

      const escrowToken = await getAssociatedTokenAddress(mintPk, escrowPda, true);
      const sellerToken = await getAssociatedTokenAddress(mintPk, sellerPk);
      const buyerToken = await getAssociatedTokenAddress(mintPk, buyerPk);

      txSig = await program.methods.disputeCancelToken()
        .accountsPartial({
          admin: adminKp.publicKey,
          seller: sellerPk,
          buyer: buyerPk,
          escrow: escrowPda,
          escrowTokenAccount: escrowToken,
          buyerTokenAccount: buyerToken,
          sellerTokenAccount: sellerToken,
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        })
        .signers([adminKp])
        .rpc();
    }

    console.log("[auto-refund] SOL done:", txSig);
    return txSig;
  } catch (err: any) {
    // If escrow is already cancelled/released on-chain, safe to cancel DB
    if (err.message?.includes("AlreadyCancelled") || err.message?.includes("AlreadyReleased") || err.message?.includes("NotLocked")) {
      console.log("[auto-refund] SOL escrow already resolved on-chain:", err.message.slice(0, 80));
      return "no_escrow";
    }
    console.error("[auto-refund] SOL failed:", err.message);
    return null;
  }
}

// ─── Dispatcher ─────────────────────────────────────────

async function autoRefund(trade: {
  id: string;
  chain: string;
  asset: string;
  escrowTxSignature: string | null;
  seller?: { walletAddress: string | null } | null;
  buyer?: { walletAddress: string | null } | null;
}): Promise<string | null> {
  if (!trade.escrowTxSignature) return null;

  if (trade.chain === "ethereum") {
    return refundEth(trade.id);
  }
  if (trade.chain === "solana") {
    if (!trade.seller?.walletAddress || !trade.buyer?.walletAddress) return null;
    return refundSol(trade.id, trade.asset, trade.seller.walletAddress, trade.buyer.walletAddress);
  }
  // BTC: manual claim (needs seller PSBT signature)
  return null;
}

export const escrowRefundService = { autoRefund };
