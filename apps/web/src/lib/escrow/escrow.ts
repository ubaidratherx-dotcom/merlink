import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  Keypair,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import idl from "./idl.json";

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_ESCROW_PROGRAM_ID ||
    "Drf9Tcbz3nDjhhyE3dGP9NvBcdLDb9QEMxW8rqMdVMvX"
);

// Devnet USDC mint
const USDC_MINT = new PublicKey(
  "DrgY2ddTgySBxeLEFHTDbAKPWSJuzdieT3ynkf8iTAeZ" // devnet test USDC
);

function padTradeId(tradeId: string): Uint8Array {
  const bytes = new TextEncoder().encode(tradeId);
  const padded = new Uint8Array(32);
  padded.set(bytes.slice(0, 32));
  return padded;
}

function getEscrowPda(tradeId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(padTradeId(tradeId))],
    PROGRAM_ID
  );
}

function getProgram(provider: AnchorProvider) {
  return new Program(idl as any, provider);
}

// ── SOL Lock / Release / Cancel ──

export async function lockSolEscrow(
  provider: AnchorProvider,
  tradeId: string,
  buyerPubkey: PublicKey,
  amountSol: number
): Promise<string> {
  const program = getProgram(provider);
  const [escrowPda] = getEscrowPda(tradeId);
  const lamports = new BN(Math.round(amountSol * 1e9));
  const tradeIdBytes = Array.from(padTradeId(tradeId));

  const tx = await (program.methods as any)
    .lockSol(tradeIdBytes, lamports)
    .accounts({
      seller: provider.wallet.publicKey,
      buyer: buyerPubkey,
      escrow: escrowPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}

export async function releaseSolEscrow(
  provider: AnchorProvider,
  tradeId: string,
  buyerPubkey: PublicKey
): Promise<string> {
  const program = getProgram(provider);
  const [escrowPda] = getEscrowPda(tradeId);

  const tx = await (program.methods as any)
    .releaseSol()
    .accounts({
      seller: provider.wallet.publicKey,
      buyer: buyerPubkey,
      escrow: escrowPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}

export async function cancelSolEscrow(
  provider: AnchorProvider,
  tradeId: string
): Promise<string> {
  const program = getProgram(provider);
  const [escrowPda] = getEscrowPda(tradeId);

  const tx = await (program.methods as any)
    .cancelSol()
    .accounts({
      seller: provider.wallet.publicKey,
      escrow: escrowPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}

// ── Token (USDC) Lock / Release / Cancel ──

export async function lockTokenEscrow(
  provider: AnchorProvider,
  tradeId: string,
  buyerPubkey: PublicKey,
  amountUsdc: number
): Promise<string> {
  const program = getProgram(provider);
  const [escrowPda] = getEscrowPda(tradeId);
  const amount = new BN(Math.round(amountUsdc * 1e6));
  const tradeIdBytes = Array.from(padTradeId(tradeId));

  const sellerAta = await getAssociatedTokenAddress(USDC_MINT, provider.wallet.publicKey);
  const escrowAta = await getAssociatedTokenAddress(USDC_MINT, escrowPda, true);

  // Create ATA for escrow PDA first if it doesn't exist
  const tx = new Transaction();
  try {
    await getAccount(provider.connection, escrowAta);
  } catch {
    tx.add(
      createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey, // payer
        escrowAta,                 // ata address
        escrowPda,                 // owner (PDA)
        USDC_MINT                  // mint
      )
    );
  }

  // Build lock instruction — escrow PDA is created by init,
  // escrow token account already exists (created above or previously)
  const lockIx = await (program.methods as any)
    .lockToken(tradeIdBytes, amount)
    .accounts({
      seller: provider.wallet.publicKey,
      buyer: buyerPubkey,
      escrow: escrowPda,
      mint: USDC_MINT,
      sellerTokenAccount: sellerAta,
      escrowTokenAccount: escrowAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  tx.add(lockIx);
  const sig = await provider.sendAndConfirm(tx);
  return sig;
}

export async function releaseTokenEscrow(
  provider: AnchorProvider,
  tradeId: string,
  buyerPubkey: PublicKey
): Promise<string> {
  const program = getProgram(provider);
  const [escrowPda] = getEscrowPda(tradeId);
  const escrowAta = await getAssociatedTokenAddress(USDC_MINT, escrowPda, true);
  const buyerAta = await getAssociatedTokenAddress(USDC_MINT, buyerPubkey);

  const tx = new Transaction();
  try {
    await getAccount(provider.connection, buyerAta);
  } catch {
    tx.add(createAssociatedTokenAccountInstruction(provider.wallet.publicKey, buyerAta, buyerPubkey, USDC_MINT));
  }

  const releaseIx = await (program.methods as any)
    .releaseToken()
    .accounts({
      seller: provider.wallet.publicKey,
      buyer: buyerPubkey,
      escrow: escrowPda,
      escrowTokenAccount: escrowAta,
      buyerTokenAccount: buyerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  tx.add(releaseIx);
  const sig = await provider.sendAndConfirm(tx);
  return sig;
}

export async function cancelTokenEscrow(
  provider: AnchorProvider,
  tradeId: string
): Promise<string> {
  const program = getProgram(provider);
  const [escrowPda] = getEscrowPda(tradeId);
  const sellerAta = await getAssociatedTokenAddress(USDC_MINT, provider.wallet.publicKey);
  const escrowAta = await getAssociatedTokenAddress(USDC_MINT, escrowPda, true);

  const tx = await (program.methods as any)
    .cancelToken()
    .accounts({
      seller: provider.wallet.publicKey,
      escrow: escrowPda,
      escrowTokenAccount: escrowAta,
      sellerTokenAccount: sellerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  return tx;
}

// ── Payment Marking ──

export async function markSolPaymentSent(
  provider: AnchorProvider,
  tradeId: string
): Promise<string> {
  const program = getProgram(provider);
  const [escrowPda] = getEscrowPda(tradeId);

  const tx = await (program.methods as any)
    .markPaymentSent()
    .accounts({
      buyer: provider.wallet.publicKey,
      escrow: escrowPda,
    })
    .rpc();

  return tx;
}

// ── Dispute ──

export async function markEscrowDisputed(
  provider: AnchorProvider,
  tradeId: string
): Promise<string> {
  const program = getProgram(provider);
  const [escrowPda] = getEscrowPda(tradeId);

  const tx = await (program.methods as any)
    .markDisputed()
    .accounts({
      caller: provider.wallet.publicKey,
      escrow: escrowPda,
    })
    .rpc();

  return tx;
}

export async function disputeReleaseSol(
  provider: AnchorProvider,
  tradeId: string,
  sellerPubkey: PublicKey,
  buyerPubkey: PublicKey
): Promise<string> {
  const program = getProgram(provider);
  const [escrowPda] = getEscrowPda(tradeId);

  const tx = await (program.methods as any)
    .disputeReleaseSol()
    .accounts({
      admin: provider.wallet.publicKey,
      seller: sellerPubkey,
      buyer: buyerPubkey,
      escrow: escrowPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}

export async function disputeCancelSol(
  provider: AnchorProvider,
  tradeId: string,
  sellerPubkey: PublicKey,
  buyerPubkey: PublicKey
): Promise<string> {
  const program = getProgram(provider);
  const [escrowPda] = getEscrowPda(tradeId);

  const tx = await (program.methods as any)
    .disputeCancelSol()
    .accounts({
      admin: provider.wallet.publicKey,
      seller: sellerPubkey,
      buyer: buyerPubkey,
      escrow: escrowPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}

export async function disputeReleaseToken(
  provider: AnchorProvider,
  tradeId: string,
  sellerPubkey: PublicKey,
  buyerPubkey: PublicKey
): Promise<string> {
  const program = getProgram(provider);
  const [escrowPda] = getEscrowPda(tradeId);
  const escrowAta = await getAssociatedTokenAddress(USDC_MINT, escrowPda, true);
  const buyerAta = await getAssociatedTokenAddress(USDC_MINT, buyerPubkey);
  const sellerAta = await getAssociatedTokenAddress(USDC_MINT, sellerPubkey);

  const tx = await (program.methods as any)
    .disputeReleaseToken()
    .accounts({
      admin: provider.wallet.publicKey,
      seller: sellerPubkey,
      buyer: buyerPubkey,
      escrow: escrowPda,
      escrowTokenAccount: escrowAta,
      buyerTokenAccount: buyerAta,
      sellerTokenAccount: sellerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  return tx;
}

export async function disputeCancelToken(
  provider: AnchorProvider,
  tradeId: string,
  sellerPubkey: PublicKey,
  buyerPubkey: PublicKey
): Promise<string> {
  const program = getProgram(provider);
  const [escrowPda] = getEscrowPda(tradeId);
  const escrowAta = await getAssociatedTokenAddress(USDC_MINT, escrowPda, true);
  const buyerAta = await getAssociatedTokenAddress(USDC_MINT, buyerPubkey);
  const sellerAta = await getAssociatedTokenAddress(USDC_MINT, sellerPubkey);

  const tx = await (program.methods as any)
    .disputeCancelToken()
    .accounts({
      admin: provider.wallet.publicKey,
      seller: sellerPubkey,
      buyer: buyerPubkey,
      escrow: escrowPda,
      escrowTokenAccount: escrowAta,
      buyerTokenAccount: buyerAta,
      sellerTokenAccount: sellerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  return tx;
}

export { PROGRAM_ID, USDC_MINT, getEscrowPda };
