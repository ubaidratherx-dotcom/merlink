/**
 * Multi-Wallet Bitcoin Adapter
 *
 * Normalizes PSBT signing across different Bitcoin wallets:
 * - Phantom, Xverse, Unisat, Leather (Hiro), OKX
 * - Fallback: manual address display (lock only, no PSBT signing)
 *
 * Each wallet has a slightly different API — this adapter provides
 * a unified interface for the rest of the app.
 */

export interface BtcWalletInfo {
  id: string;
  name: string;
  icon: string; // emoji or URL
  installed: boolean;
}

export interface BtcWalletAdapter {
  id: string;
  name: string;
  /** Whether this wallet supports direct sendBitcoin (auto-lock) */
  canSend: boolean;
  /** Connect and return { address, publicKey (hex) } */
  connect(): Promise<{ address: string; publicKey: string }>;
  /** Sign a PSBT (as Uint8Array), return signed PSBT bytes */
  signPSBT(psbtBytes: Uint8Array, inputsToSign: { address: string; signingIndexes: number[] }[]): Promise<Uint8Array>;
  /** Send BTC directly (if supported). Returns txid. */
  sendBitcoin?(toAddress: string, satoshis: number): Promise<string>;
}

// ─── Phantom ────────────────────────────────────────────

function getPhantomProvider(): any | null {
  return (window as any).phantom?.bitcoin ?? null;
}

const phantomAdapter: BtcWalletAdapter = {
  id: "phantom",
  name: "Phantom",
  canSend: false, // Phantom BTC doesn't have sendBitcoin
  async connect() {
    const provider = getPhantomProvider();
    if (!provider) throw new Error("Phantom Bitcoin not found");
    const accounts = await provider.requestAccounts();
    const acct = accounts.find((a: any) => a.addressType === "p2wpkh") || accounts[0];
    return {
      address: acct.address,
      publicKey: typeof acct.publicKey === "string"
        ? acct.publicKey
        : bytesToHex(new Uint8Array(acct.publicKey)),
    };
  },
  async signPSBT(psbtBytes, inputsToSign) {
    const provider = getPhantomProvider();
    if (!provider) throw new Error("Phantom Bitcoin not found");
    const result = await provider.signPSBT(psbtBytes, { inputsToSign });
    return new Uint8Array(result);
  },
};

// ─── Unisat ─────────────────────────────────────────────

function getUnisatProvider(): any | null {
  return (window as any).unisat ?? null;
}

const unisatAdapter: BtcWalletAdapter = {
  id: "unisat",
  name: "Unisat",
  canSend: true,
  async connect() {
    const provider = getUnisatProvider();
    if (!provider) throw new Error("Unisat wallet not found");
    const accounts = await provider.requestAccounts();
    const pubkey = await provider.getPublicKey();
    return { address: accounts[0], publicKey: pubkey };
  },
  async signPSBT(psbtBytes, _inputsToSign) {
    const provider = getUnisatProvider();
    if (!provider) throw new Error("Unisat wallet not found");
    const psbtHex = bytesToHex(psbtBytes);
    const signedHex = await provider.signPsbt(psbtHex);
    return hexToBytes(signedHex);
  },
  async sendBitcoin(toAddress: string, satoshis: number) {
    const provider = getUnisatProvider();
    if (!provider) throw new Error("Unisat wallet not found");
    const txid = await provider.sendBitcoin(toAddress, satoshis);
    return txid;
  },
};

// ─── Xverse ─────────────────────────────────────────────

function getXverseProvider(): any | null {
  return (window as any).XverseProviders?.BitcoinProvider ?? (window as any).BitcoinProvider ?? null;
}

const xverseAdapter: BtcWalletAdapter = {
  id: "xverse",
  name: "Xverse",
  canSend: false,
  async connect() {
    const provider = getXverseProvider();
    if (!provider) throw new Error("Xverse wallet not found");
    const response = await provider.connect();
    // Xverse returns addresses array
    const payment = response.addresses.find((a: any) => a.purpose === "payment") || response.addresses[0];
    return { address: payment.address, publicKey: payment.publicKey };
  },
  async signPSBT(psbtBytes, inputsToSign) {
    const provider = getXverseProvider();
    if (!provider) throw new Error("Xverse wallet not found");
    // Xverse takes base64 — use chunked encoding to avoid stack overflow on large PSBTs
    const psbtBase64 = uint8ToBase64(psbtBytes);
    const result = await provider.signPsbt({
      psbt: psbtBase64,
      signInputs: Object.fromEntries(
        inputsToSign.map(i => [i.address, i.signingIndexes])
      ),
    });
    // Returns base64
    return Uint8Array.from(atob(result.psbt), c => c.charCodeAt(0));
  },
};

// ─── Leather (Hiro) ─────────────────────────────────────

function getLeatherProvider(): any | null {
  return (window as any).LeatherProvider ?? (window as any).HiroWalletProvider ?? null;
}

const leatherAdapter: BtcWalletAdapter = {
  id: "leather",
  name: "Leather",
  canSend: false,
  async connect() {
    const provider = getLeatherProvider();
    if (!provider) throw new Error("Leather wallet not found");
    const response = await provider.request("getAddresses");
    const payment = response.result.addresses.find((a: any) => a.type === "p2wpkh") || response.result.addresses[0];
    return { address: payment.address, publicKey: payment.publicKey };
  },
  async signPSBT(psbtBytes, _inputsToSign) {
    const provider = getLeatherProvider();
    if (!provider) throw new Error("Leather wallet not found");
    const psbtHex = bytesToHex(psbtBytes);
    const response = await provider.request("signPsbt", { hex: psbtHex });
    return hexToBytes(response.result.hex);
  },
};

// ─── OKX ────────────────────────────────────────────────

function getOkxProvider(): any | null {
  return (window as any).okxwallet?.bitcoin ?? null;
}

const okxAdapter: BtcWalletAdapter = {
  id: "okx",
  name: "OKX Wallet",
  canSend: true,
  async connect() {
    const provider = getOkxProvider();
    if (!provider) throw new Error("OKX Bitcoin wallet not found");
    const result = await provider.connect();
    const pubkey = await provider.getPublicKey();
    return { address: result.address, publicKey: pubkey };
  },
  async signPSBT(psbtBytes, _inputsToSign) {
    const provider = getOkxProvider();
    if (!provider) throw new Error("OKX Bitcoin wallet not found");
    const psbtHex = bytesToHex(psbtBytes);
    const signedHex = await provider.signPsbt(psbtHex);
    return hexToBytes(signedHex);
  },
  async sendBitcoin(toAddress: string, satoshis: number) {
    const provider = getOkxProvider();
    if (!provider) throw new Error("OKX Bitcoin wallet not found");
    const txid = await provider.sendBitcoin(toAddress, satoshis);
    return txid;
  },
};

// ─── Registry ───────────────────────────────────────────

const ALL_ADAPTERS = [phantomAdapter, unisatAdapter, xverseAdapter, leatherAdapter, okxAdapter];

/** Detect which BTC wallets are installed */
export function detectBtcWallets(): BtcWalletInfo[] {
  if (typeof window === "undefined") return [];

  return [
    { id: "phantom", name: "Phantom", icon: "👻", installed: !!getPhantomProvider() },
    { id: "unisat", name: "Unisat", icon: "🟧", installed: !!getUnisatProvider() },
    { id: "xverse", name: "Xverse", icon: "🔵", installed: !!getXverseProvider() },
    { id: "leather", name: "Leather", icon: "🟤", installed: !!getLeatherProvider() },
    { id: "okx", name: "OKX Wallet", icon: "⬛", installed: !!getOkxProvider() },
  ];
}

/** Get installed wallet adapters */
export function getInstalledBtcWallets(): BtcWalletAdapter[] {
  if (typeof window === "undefined") return [];
  return ALL_ADAPTERS.filter(a => {
    switch (a.id) {
      case "phantom": return !!getPhantomProvider();
      case "unisat": return !!getUnisatProvider();
      case "xverse": return !!getXverseProvider();
      case "leather": return !!getLeatherProvider();
      case "okx": return !!getOkxProvider();
      default: return false;
    }
  });
}

/** Get a specific wallet adapter by ID */
export function getBtcWallet(id: string): BtcWalletAdapter | null {
  const adapter = ALL_ADAPTERS.find(a => a.id === id);
  if (!adapter) return null;

  // Verify it's installed
  const installed = getInstalledBtcWallets();
  return installed.find(a => a.id === id) || null;
}

// ─── Utils ──────────────────────────────────────────────

/** Safe base64 encoding that doesn't overflow the call stack on large arrays */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (!hex || hex.length === 0) return new Uint8Array(0);
  // Pad odd-length hex strings
  const padded = hex.length % 2 === 1 ? "0" + hex : hex;
  const matches = padded.match(/.{2}/g);
  if (!matches) return new Uint8Array(0);
  return Uint8Array.from(matches.map(b => parseInt(b, 16)));
}
