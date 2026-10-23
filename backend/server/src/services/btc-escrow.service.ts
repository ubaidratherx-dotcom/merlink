/**
 * Bitcoin 2-of-3 Multisig Escrow Service
 *
 * Flow:
 * 1. Trade created → generate 2-of-3 P2SH multisig (seller + buyer + admin)
 * 2. Seller sends BTC to multisig address (external wallet)
 * 3. Backend detects deposit via Blockstream API
 * 4. Release: build PSBT → seller signs via Phantom → admin co-signs server-side → broadcast
 * 5. Dispute: admin + party co-sign → broadcast
 */

import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { ECPairFactory } from "ecpair";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const NETWORK = process.env.BTC_NETWORK === "mainnet"
  ? bitcoin.networks.bitcoin
  : bitcoin.networks.testnet;

const BLOCKSTREAM_API = process.env.BTC_NETWORK === "mainnet"
  ? "https://blockstream.info/api"
  : "https://blockstream.info/testnet/api";

// Admin WIF key — must be set in env
const ADMIN_WIF = process.env.BTC_ADMIN_WIF || "";
// Platform dispute key — second server-held key for dispute resolution (2-of-3)
const PLATFORM_WIF = process.env.BTC_PLATFORM_WIF || "";

function getAdminKeyPair() {
  if (!ADMIN_WIF) throw new AppError("BTC admin key not configured", 500, "CONFIG_ERROR");
  return ECPair.fromWIF(ADMIN_WIF, NETWORK);
}

function getPlatformKeyPair() {
  if (!PLATFORM_WIF) throw new AppError("BTC platform key not configured", 500, "CONFIG_ERROR");
  return ECPair.fromWIF(PLATFORM_WIF, NETWORK);
}

function getAdminPubkey(): Buffer {
  return getAdminKeyPair().publicKey;
}

function getPlatformPubkey(): Buffer {
  return getPlatformKeyPair().publicKey;
}

// ─── P2SH-P2WSH Multisig Finalizer ──────────────────────

/**
 * Custom PSBT finalizer for P2SH-P2WSH 2-of-3 multisig.
 * bitcoinjs-lib v7's default finalizer can't handle this, so we do it manually.
 */
function finalizeP2SHP2WSHInput(inputIndex: number, input: any) {
  const sigs = input.partialSig.map((ps: any) => Buffer.from(ps.signature));
  const witnessScript = Buffer.from(input.witnessScript);
  const redeemScript = Buffer.from(input.redeemScript);

  // Witness: OP_0 <sig1> <sig2> <witnessScript>
  const witness = [Buffer.alloc(0), ...sigs, witnessScript];

  // ScriptSig: <redeemScript> (for P2SH wrapping)
  const scriptSig = bitcoin.script.compile([redeemScript]);

  return {
    finalScriptSig: scriptSig,
    finalScriptWitness: witnessStackToScriptWitness(witness),
  };
}

function witnessStackToScriptWitness(witness: Buffer[]): Buffer {
  let buffer = Buffer.allocUnsafe(0);
  function writeVarInt(i: number) {
    const buf = Buffer.allocUnsafe(5);
    let offset = 0;
    if (i < 253) { buf.writeUInt8(i, 0); offset = 1; }
    else if (i <= 0xffff) { buf.writeUInt8(253, 0); buf.writeUInt16LE(i, 1); offset = 3; }
    else { buf.writeUInt8(254, 0); buf.writeUInt32LE(i, 1); offset = 5; }
    buffer = Buffer.concat([buffer, buf.subarray(0, offset)]);
  }
  function writeVarSlice(slice: Buffer) {
    writeVarInt(slice.length);
    buffer = Buffer.concat([buffer, slice]);
  }
  writeVarInt(witness.length);
  witness.forEach(w => writeVarSlice(w));
  return buffer;
}

// ─── Multisig Generation ─────────────────────────────────

interface MultisigResult {
  address: string;
  redeemScript: string;
  witnessScript?: string;
}

function createP2SHMultisig(
  sellerPubkey: Buffer,
  buyerPubkey: Buffer,
  adminPubkey: Buffer
): MultisigResult {
  // BIP67: sort pubkeys lexicographically
  const pubkeys = [
    Buffer.from(sellerPubkey),
    Buffer.from(buyerPubkey),
    Buffer.from(adminPubkey),
  ].sort((a, b) => a.compare(b));

  const p2ms = bitcoin.payments.p2ms({
    m: 2,
    pubkeys,
    network: NETWORK,
  });

  // P2SH-P2WSH for lower fees (SegWit wrapped)
  const p2wsh = bitcoin.payments.p2wsh({
    redeem: p2ms,
    network: NETWORK,
  });

  const p2sh = bitcoin.payments.p2sh({
    redeem: p2wsh,
    network: NETWORK,
  });

  if (!p2sh.address || !p2ms.output || !p2wsh.output) {
    throw new AppError("Failed to generate multisig address", 500, "BTC_ERROR");
  }

  return {
    address: p2sh.address,
    redeemScript: Buffer.from(p2wsh.output).toString("hex"),
    witnessScript: Buffer.from(p2ms.output).toString("hex"),
  };
}

/**
 * Create a multisig escrow address for a trade.
 * Stores the address and redeem script in the trade record.
 */
async function createEscrow(
  tradeId: string,
  sellerBtcPubkey: string,
  buyerBtcPubkey: string
): Promise<MultisigResult> {
  // Verify both parties still have valid BTC wallets in DB
  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: {
      seller: { select: { btcPubkey: true, btcAddress: true } },
      buyer: { select: { btcPubkey: true, btcAddress: true } },
    },
  });
  if (!trade) throw new AppError("Trade not found", 404, "NOT_FOUND");
  if (!trade.seller?.btcPubkey || !trade.seller?.btcAddress) {
    throw new AppError("Seller has no BTC wallet connected", 400, "NO_SELLER_WALLET");
  }
  if (!trade.buyer?.btcPubkey || !trade.buyer?.btcAddress) {
    throw new AppError("Buyer has no BTC wallet connected", 400, "NO_BUYER_WALLET");
  }
  // Use the DB-stored pubkeys, not the ones from the request
  const verifiedSellerPub = trade.seller.btcPubkey;
  const verifiedBuyerPub = trade.buyer.btcPubkey;

  const adminPubkey = getAdminPubkey();
  const result = createP2SHMultisig(
    Buffer.from(verifiedSellerPub, "hex"),
    Buffer.from(verifiedBuyerPub, "hex"),
    adminPubkey
  );

  // Store escrow info
  await prisma.trade.update({
    where: { id: tradeId },
    data: {
      escrowAddress: result.address,
      // Store redeem script in a field we can use later
      escrowTxSignature: JSON.stringify({
        redeemScript: result.redeemScript,
        witnessScript: result.witnessScript,
        sellerPubkey: sellerBtcPubkey,
        buyerPubkey: buyerBtcPubkey,
        adminPubkey: Buffer.from(adminPubkey).toString("hex"),
      }),
    },
  });

  return result;
}

// ─── Deposit Detection ───────────────────────────────────

interface DepositInfo {
  confirmed: boolean;
  amount: number; // BTC
  txid: string | null;
  utxos: Array<{ txid: string; vout: number; value: number; confirmed: boolean }>;
}

async function checkDeposit(address: string): Promise<DepositInfo> {
  try {
    const res = await fetch(`${BLOCKSTREAM_API}/address/${address}/utxo`);
    if (!res.ok) throw new Error(`Blockstream API: ${res.status}`);
    const utxos: any[] = await res.json();

    if (utxos.length === 0) {
      return { confirmed: false, amount: 0, txid: null, utxos: [] };
    }

    const totalSats = utxos.reduce((sum: number, u: any) => sum + u.value, 0);
    const hasConfirmed = utxos.some((u: any) => u.status?.confirmed);

    return {
      confirmed: hasConfirmed,
      amount: totalSats / 1e8,
      txid: utxos[0]?.txid || null,
      utxos: utxos.map((u: any) => ({
        txid: u.txid,
        vout: u.vout,
        value: u.value,
        confirmed: u.status?.confirmed || false,
      })),
    };
  } catch (err) {
    console.error("[btc] Deposit check failed:", err);
    return { confirmed: false, amount: 0, txid: null, utxos: [] };
  }
}

// ─── PSBT Building ───────────────────────────────────────

/**
 * Estimate fee from Blockstream API, fallback to conservative default.
 */
async function estimateFee(numInputs: number): Promise<number> {
  try {
    const res = await fetch(`${BLOCKSTREAM_API}/fee-estimates`);
    if (!res.ok) throw new Error("Fee API failed");
    const estimates: Record<string, number> = await res.json();
    // Use 6-block target (~ 1 hour), fallback to 3-block
    const satPerVbyte = estimates["6"] || estimates["3"] || 10;
    // P2SH-P2WSH 2-of-3 multisig: ~140 vbytes per input + ~40 vbytes overhead + ~30 per output
    const estimatedVsize = 40 + (numInputs * 140) + 30;
    return Math.ceil(satPerVbyte * estimatedVsize);
  } catch {
    // Conservative fallback: 10 sat/vbyte
    const estimatedVsize = 40 + (numInputs * 140) + 30;
    return Math.ceil(10 * estimatedVsize);
  }
}

/**
 * Build a PSBT for releasing funds from the multisig.
 * Returns the PSBT as base64 for the seller to sign.
 * Only uses confirmed UTXOs to prevent RBF double-spend.
 */
async function buildReleasePSBT(
  tradeId: string,
  recipientAddress: string
): Promise<{ psbtBase64: string; fee: number }> {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade?.escrowAddress) throw new AppError("No escrow address", 400, "NO_ESCROW");

  let escrowData: any;
  try {
    escrowData = JSON.parse(trade.escrowTxSignature || "{}");
  } catch {
    throw new AppError("Corrupt escrow data", 400, "CORRUPT_DATA");
  }
  if (!escrowData.redeemScript || !escrowData.witnessScript) {
    throw new AppError("Missing escrow script data", 400, "NO_SCRIPT");
  }

  // Get UTXOs — on mainnet, only confirmed to prevent RBF attacks
  // On testnet, allow unconfirmed to speed up testing
  const deposit = await checkDeposit(trade.escrowAddress);
  const isTestnet = NETWORK === bitcoin.networks.testnet;
  const usableUtxos = isTestnet ? deposit.utxos : deposit.utxos.filter(u => u.confirmed);
  if (usableUtxos.length === 0) {
    if (deposit.utxos.length > 0 && !isTestnet) {
      throw new AppError("Deposit not yet confirmed — please wait for at least 1 confirmation", 400, "UNCONFIRMED");
    }
    throw new AppError("No funds in escrow", 400, "NO_FUNDS");
  }
  const confirmedUtxos = usableUtxos;

  const totalSats = confirmedUtxos.reduce((sum, u) => sum + u.value, 0);
  const fee = await estimateFee(confirmedUtxos.length);
  const sendSats = totalSats - fee;

  if (sendSats < 546) throw new AppError(`Insufficient funds after fee (${fee} sats)`, 400, "INSUFFICIENT");

  const psbt = new bitcoin.Psbt({ network: NETWORK });

  const redeemScript = Buffer.from(escrowData.redeemScript, "hex");
  const witnessScript = Buffer.from(escrowData.witnessScript, "hex");

  // Add inputs — only confirmed UTXOs
  for (const utxo of confirmedUtxos) {
    const txRes = await fetch(`${BLOCKSTREAM_API}/tx/${utxo.txid}/hex`);
    if (!txRes.ok) throw new AppError(`Failed to fetch tx ${utxo.txid}`, 500, "TX_FETCH_FAILED");
    const txHex = await txRes.text();

    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      nonWitnessUtxo: Buffer.from(txHex, "hex"),
      redeemScript,
      witnessScript,
    });
  }

  // Add output — send to recipient (bitcoinjs-lib v7 requires BigInt for values)
  psbt.addOutput({
    address: recipientAddress,
    value: BigInt(sendSats),
  });

  return {
    psbtBase64: psbt.toBase64(),
    fee,
  };
}

/**
 * Admin co-signs a PSBT and broadcasts it.
 * The seller has already partially signed.
 *
 * SECURITY: Validates the PSBT belongs to a known trade escrow
 * and outputs match the expected recipient + amount.
 */
async function adminCoSignAndBroadcast(
  tradeId: string,
  psbtBase64: string,
  callerId: string
): Promise<string> {
  // 1. Verify the trade exists and caller is a participant
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new AppError("Trade not found", 404, "NOT_FOUND");
  if (trade.sellerId !== callerId && trade.buyerId !== callerId) {
    throw new AppError("Not authorized for this trade", 403, "FORBIDDEN");
  }
  if (!trade.escrowAddress) throw new AppError("No escrow address", 400, "NO_ESCROW");
  if (trade.status === "COMPLETED") {
    throw new AppError("Trade already completed — funds have been released", 400, "ALREADY_COMPLETED");
  }
  if (!["PAYMENT_MARKED_SENT", "RELEASE_PENDING", "RESOLVED"].includes(trade.status)) {
    throw new AppError("Trade not in releasable state", 400, "INVALID_STATE");
  }

  const escrowData = JSON.parse(trade.escrowTxSignature || "{}");
  if (!escrowData.redeemScript) throw new AppError("Missing escrow data", 400, "NO_SCRIPT");

  // Determine expected recipient based on trade state
  let expectedRecipientAddress: string;
  if (trade.status === "RESOLVED") {
    // Dispute claim — recipient is the winner
    const dispute = await prisma.dispute.findFirst({
      where: { tradeId },
      orderBy: { createdAt: "desc" },
    });
    if (!dispute?.resolution) throw new AppError("Dispute not resolved", 400, "NOT_RESOLVED");
    const winnerId = dispute.resolution === "RELEASE_TO_BUYER" ? trade.buyerId : trade.sellerId;
    if (callerId !== winnerId) {
      throw new AppError("Only the winning party can claim", 403, "NOT_WINNER");
    }
    const winner = await prisma.user.findUnique({ where: { id: winnerId } });
    if (!winner?.btcAddress) throw new AppError("Winner has no BTC address", 400, "NO_ADDR");
    expectedRecipientAddress = winner.btcAddress;
  } else {
    // Normal release — recipient is buyer
    const buyer = await prisma.user.findUnique({ where: { id: trade.buyerId } });
    if (!buyer?.btcAddress) throw new AppError("Buyer has no BTC address", 400, "NO_BUYER_ADDR");
    expectedRecipientAddress = buyer.btcAddress;
  }

  // 2. Decode PSBT and validate inputs are from our escrow
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: NETWORK });

  // Verify all inputs spend from the known escrow address UTXOs
  const deposit = await checkDeposit(trade.escrowAddress);
  const knownTxids = new Set(deposit.utxos.map(u => u.txid));
  for (let i = 0; i < psbt.inputCount; i++) {
    const input = psbt.txInputs[i];
    const inputTxid = Buffer.from(input.hash).reverse().toString("hex");
    if (!knownTxids.has(inputTxid)) {
      throw new AppError("PSBT contains unknown inputs — possible tampering", 400, "INVALID_PSBT");
    }
  }

  // Verify output goes to expected recipient
  const outputAddresses: string[] = [];
  for (let i = 0; i < psbt.txOutputs.length; i++) {
    const out = psbt.txOutputs[i];
    if (out.address) outputAddresses.push(out.address);
  }
  if (!outputAddresses.includes(expectedRecipientAddress)) {
    throw new AppError("PSBT output doesn't match expected recipient — possible tampering", 400, "INVALID_PSBT");
  }

  // 3. Admin signs all inputs
  const adminKeyPair = getAdminKeyPair();
  for (let i = 0; i < psbt.inputCount; i++) {
    psbt.signInput(i, adminKeyPair);
  }

  // 4. Finalize and broadcast
  for (let i = 0; i < psbt.inputCount; i++) {
    psbt.finalizeInput(i, finalizeP2SHP2WSHInput);
  }
  const txHex = psbt.extractTransaction().toHex();
  const res = await fetch(`${BLOCKSTREAM_API}/tx`, {
    method: "POST",
    body: txHex,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new AppError(`Broadcast failed: ${errText}`, 500, "BROADCAST_FAILED");
  }

  const txid = (await res.text()).trim();

  // After successful broadcast, mark trade as COMPLETED to prevent double claims
  if (trade.status === "RESOLVED") {
    await prisma.trade.update({
      where: { id: tradeId },
      data: { status: "COMPLETED", releaseTxSignature: txid },
    });
  }

  return txid;
}

/**
 * Dispute release — build PSBT for dispute resolution.
 * Returns the PSBT base64 for the winning party to sign via their wallet.
 * After they sign, submit to adminCoSignAndBroadcast.
 *
 * Flow: admin builds PSBT → winning party signs → admin co-signs + broadcasts
 */
async function buildDisputeReleasePSBT(
  tradeId: string,
  callerId: string
): Promise<{ psbtBase64: string; fee: number }> {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new AppError("Trade not found", 404, "NOT_FOUND");
  if (trade.status === "COMPLETED") {
    throw new AppError("Trade already completed — funds have been released", 400, "ALREADY_COMPLETED");
  }
  if (trade.status !== "RESOLVED") {
    throw new AppError("Trade not yet resolved by admin", 400, "INVALID_STATE");
  }

  // Look up the dispute resolution to determine the winner
  const dispute = await prisma.dispute.findFirst({
    where: { tradeId },
    orderBy: { createdAt: "desc" },
  });
  if (!dispute?.resolution) throw new AppError("Dispute not resolved", 400, "NOT_RESOLVED");

  // Determine winner's address from resolution
  const winnerId = dispute.resolution === "RELEASE_TO_BUYER" ? trade.buyerId : trade.sellerId;

  // Only the winner can build the claim PSBT
  if (callerId !== winnerId) {
    throw new AppError("Only the winning party can claim disputed funds", 403, "NOT_WINNER");
  }

  const winner = await prisma.user.findUnique({ where: { id: winnerId } });
  if (!winner?.btcAddress) throw new AppError("Winner has no BTC address", 400, "NO_WINNER_ADDR");

  // Build PSBT with winner's address hardcoded server-side (not from frontend)
  return buildReleasePSBT(tradeId, winner.btcAddress);
}

/**
 * Admin-only dispute resolution: admin + platform key co-sign (no party needed).
 * Used when neither party cooperates. Requires BTC_PLATFORM_WIF env var.
 * The platform key replaces the buyer's key in the multisig for this purpose —
 * BUT this only works if we change the multisig to include the platform key.
 *
 * For standard 2-of-3 (seller + buyer + admin), the correct dispute flow is:
 * buildDisputeReleasePSBT → winning party signs → adminCoSignAndBroadcast
 */
async function adminForceRelease(
  tradeId: string
): Promise<string> {
  // Look up dispute resolution to determine winner's address
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new AppError("Trade not found", 404, "NOT_FOUND");

  const dispute = await prisma.dispute.findFirst({
    where: { tradeId },
    orderBy: { createdAt: "desc" },
  });
  if (!dispute?.resolution) throw new AppError("Dispute not resolved", 400, "NOT_RESOLVED");

  const winnerId = dispute.resolution === "RELEASE_TO_BUYER" ? trade.buyerId : trade.sellerId;
  const winner = await prisma.user.findUnique({ where: { id: winnerId } });
  if (!winner?.btcAddress) throw new AppError("Winner has no BTC address", 400, "NO_WINNER_ADDR");

  const { psbtBase64 } = await buildReleasePSBT(tradeId, winner.btcAddress);
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: NETWORK });

  // Need 2 of 3 signatures. If platform key is one of the 3, admin + platform can release.
  // Otherwise, this will fail at finalization — one of the parties must cooperate.
  const adminKeyPair = getAdminKeyPair();
  for (let i = 0; i < psbt.inputCount; i++) {
    psbt.signInput(i, adminKeyPair);
  }

  // Try platform key if configured
  if (PLATFORM_WIF) {
    const platformKeyPair = getPlatformKeyPair();
    for (let i = 0; i < psbt.inputCount; i++) {
      psbt.signInput(i, platformKeyPair);
    }
  } else {
    throw new AppError(
      "Platform key not configured — dispute requires winning party to co-sign via buildDisputeReleasePSBT",
      500,
      "NO_PLATFORM_KEY"
    );
  }

  for (let i = 0; i < psbt.inputCount; i++) {
    psbt.finalizeInput(i, finalizeP2SHP2WSHInput);
  }
  const txHex = psbt.extractTransaction().toHex();
  const res = await fetch(`${BLOCKSTREAM_API}/tx`, {
    method: "POST",
    body: txHex,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new AppError(`Broadcast failed: ${errText}`, 500, "BROADCAST_FAILED");
  }

  return (await res.text()).trim();
}

// ─── Cancel / Refund ────────────────────────────────────

/**
 * Build a PSBT to refund escrow back to the seller (cancel flow).
 * Same as buildReleasePSBT but sends to seller address instead of buyer.
 */
async function buildCancelPSBT(
  tradeId: string
): Promise<{ psbtBase64: string; fee: number }> {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade?.escrowAddress) throw new AppError("No escrow address", 400, "NO_ESCROW");

  // Refund goes back to seller's BTC address
  const seller = await prisma.user.findUnique({ where: { id: trade.sellerId } });
  if (!seller?.btcAddress) throw new AppError("Seller has no BTC address", 400, "NO_SELLER_ADDR");

  return buildReleasePSBT(tradeId, seller.btcAddress);
}

/**
 * Admin co-sign cancel PSBT and broadcast (refund to seller).
 * Validates that the output goes to the seller's address.
 */
async function adminCoSignCancel(
  tradeId: string,
  psbtBase64: string,
  callerId: string
): Promise<string> {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new AppError("Trade not found", 404, "NOT_FOUND");
  if (trade.sellerId !== callerId && trade.buyerId !== callerId) {
    throw new AppError("Not authorized for this trade", 403, "FORBIDDEN");
  }
  if (!["CREATED", "ESCROW_LOCKED", "CANCELLED"].includes(trade.status)) {
    throw new AppError("Trade not in cancellable state", 400, "INVALID_STATE");
  }

  const seller = await prisma.user.findUnique({ where: { id: trade.sellerId } });
  if (!seller?.btcAddress) throw new AppError("Seller has no BTC address", 400, "NO_SELLER_ADDR");

  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: NETWORK });

  // Validate output goes to seller (refund)
  const outputAddresses: string[] = [];
  for (let i = 0; i < psbt.txOutputs.length; i++) {
    if (psbt.txOutputs[i].address) outputAddresses.push(psbt.txOutputs[i].address!);
  }
  if (!outputAddresses.includes(seller.btcAddress)) {
    throw new AppError("Cancel PSBT output doesn't match seller address", 400, "INVALID_PSBT");
  }

  const adminKeyPair = getAdminKeyPair();
  for (let i = 0; i < psbt.inputCount; i++) {
    psbt.signInput(i, adminKeyPair);
  }

  for (let i = 0; i < psbt.inputCount; i++) {
    psbt.finalizeInput(i, finalizeP2SHP2WSHInput);
  }
  const txHex = psbt.extractTransaction().toHex();
  const res = await fetch(`${BLOCKSTREAM_API}/tx`, {
    method: "POST",
    body: txHex,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new AppError(`Broadcast failed: ${errText}`, 500, "BROADCAST_FAILED");
  }

  return (await res.text()).trim();
}

// ─── Balance ─────────────────────────────────────────────

async function getBalance(address: string): Promise<number> {
  try {
    const res = await fetch(`${BLOCKSTREAM_API}/address/${address}`);
    if (!res.ok) return 0;
    const data: any = await res.json();
    const funded = (data.chain_stats?.funded_txo_sum || 0) + (data.mempool_stats?.funded_txo_sum || 0);
    const spent = (data.chain_stats?.spent_txo_sum || 0) + (data.mempool_stats?.spent_txo_sum || 0);
    return (funded - spent) / 1e8;
  } catch {
    return 0;
  }
}

// ─── Exports ─────────────────────────────────────────────

export const btcEscrowService = {
  createEscrow,
  checkDeposit,
  buildReleasePSBT,
  buildCancelPSBT,
  adminCoSignAndBroadcast,
  adminCoSignCancel,
  buildDisputeReleasePSBT,
  adminForceRelease,
  getBalance,
  getAdminPubkey,
  getPlatformPubkey,
  NETWORK,
  BLOCKSTREAM_API,
};
