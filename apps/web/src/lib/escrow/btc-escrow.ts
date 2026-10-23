/**
 * Bitcoin Escrow Frontend Helper
 *
 * BTC uses 2-of-3 multisig — different from SOL/ETH smart contracts.
 * Flow:
 *   Lock: build PSBT to send from seller → multisig, seller signs via wallet
 *   Release: build PSBT from multisig → buyer, seller signs, admin co-signs
 *   Dispute: admin + party co-sign via server
 *
 * Supports multiple wallets via btc-wallet adapter:
 *   Phantom, Unisat, Xverse, Leather, OKX
 */

import { api } from "@/lib/api";
import type { BtcWalletAdapter } from "@/lib/btc-wallet";

/**
 * Step 1: Create multisig escrow address.
 * Returns the address the seller needs to send BTC to.
 */
export async function createBtcEscrow(
  tradeId: string,
  sellerBtcPubkey: string,
  buyerBtcPubkey: string
): Promise<{ address: string; redeemScript: string }> {
  return api.btc.createEscrow({ tradeId, sellerBtcPubkey, buyerBtcPubkey });
}

/**
 * Step 2: Check if deposit has arrived at the multisig address.
 */
export async function checkBtcDeposit(address: string): Promise<{
  confirmed: boolean;
  amount: number;
  txid: string | null;
}> {
  return api.btc.checkDeposit(address);
}

/**
 * Step 3: Build release PSBT and have seller sign via their BTC wallet.
 * Then send to server for admin co-sign + broadcast.
 *
 * @param wallet - The BTC wallet adapter to use for signing
 */
export async function releaseBtcEscrow(
  tradeId: string,
  recipientAddress: string,
  sellerBtcAddress: string,
  wallet: BtcWalletAdapter
): Promise<string> {
  // 1. Server builds the PSBT
  const { psbtBase64 } = await api.btc.buildRelease({ tradeId, recipientAddress });

  // 2. Convert to bytes
  const psbtBytes = Uint8Array.from(atob(psbtBase64), c => c.charCodeAt(0));

  // 3. Seller signs via their wallet — sign ALL inputs (not just [0])
  // Parse PSBT to find input count (inputs are at fixed offset in binary, but safer to count from base64)
  // For simplicity, we'll request signing of indexes 0-9 (excess are ignored by wallets)
  const maxInputs = 10;
  const signingIndexes = Array.from({ length: maxInputs }, (_, i) => i);
  const signedBytes = await wallet.signPSBT(psbtBytes, [{
    address: sellerBtcAddress,
    signingIndexes,
  }]);

  // 4. Convert back to base64 (chunked to avoid stack overflow on large PSBTs)
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < signedBytes.length; i += chunkSize) {
    const chunk = signedBytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const signedBase64 = btoa(binary);

  // 5. Send to server for admin co-sign + broadcast (includes tradeId for validation)
  const { txid } = await api.btc.coSignBroadcast(tradeId, signedBase64);
  return txid;
}

/**
 * Get BTC balance of an address
 */
export async function getBtcBalance(address: string): Promise<number> {
  const { btc } = await api.btc.getBalance(address);
  return btc;
}

/**
 * Get admin's BTC public key (for multisig generation)
 */
export async function getAdminBtcPubkey(): Promise<string> {
  const { pubkey } = await api.btc.getAdminPubkey();
  return pubkey;
}
