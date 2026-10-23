import { Connection, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { ethers } from "ethers";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPECTED_MESSAGE =
  "Sign this message to verify wallet ownership for CryptoMeet.";

const USDC_MINT_DEVNET = "DrgY2ddTgySBxeLEFHTDbAKPWSJuzdieT3ynkf8iTAeZ"; // test USDC on devnet
const USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeUser(user: Record<string, unknown>) {
  const { passwordHash, ...rest } = user;
  return rest;
}

function getUsdcMint(): PublicKey {
  const network = process.env.SOLANA_NETWORK || "devnet";
  const mint =
    network === "mainnet-beta" ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;
  return new PublicKey(mint);
}

function getConnection(): Connection {
  const rpcUrl =
    process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  return new Connection(rpcUrl, "confirmed");
}

// ---------------------------------------------------------------------------
// verifyAndConnect
// ---------------------------------------------------------------------------

async function verifyAndConnect(
  userId: string,
  walletAddress: string,
  signature: string,
  message: string
) {
  // Validate message content
  if (message !== EXPECTED_MESSAGE) {
    throw new AppError("Invalid verification message", 400, "BAD_REQUEST");
  }

  // Decode wallet address to public key bytes
  let publicKeyBytes: Uint8Array;
  try {
    const publicKey = new PublicKey(walletAddress);
    publicKeyBytes = publicKey.toBytes();
  } catch {
    throw new AppError("Invalid wallet address", 400, "BAD_REQUEST");
  }

  // Decode the signature from base58
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = bs58.decode(signature);
  } catch {
    throw new AppError("Invalid signature format", 400, "BAD_REQUEST");
  }

  // Encode the message to bytes
  const messageBytes = new TextEncoder().encode(message);

  // Verify the signature using tweetnacl
  const isValid = nacl.sign.detached.verify(
    messageBytes,
    signatureBytes,
    publicKeyBytes
  );

  if (!isValid) {
    throw new AppError(
      "Wallet signature verification failed",
      401,
      "UNAUTHORIZED"
    );
  }

  // Check if this wallet is already connected to another user
  const existingUser = await prisma.user.findUnique({
    where: { walletAddress },
  });

  if (existingUser && existingUser.id !== userId) {
    throw new AppError(
      "This wallet is already connected to another account",
      409,
      "CONFLICT"
    );
  }

  // Update user with verified wallet
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      walletAddress,
      walletVerified: true,
    },
  });

  return sanitizeUser(updatedUser);
}

// ---------------------------------------------------------------------------
// disconnectWallet
// ---------------------------------------------------------------------------

async function disconnectWallet(userId: string) {
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      walletAddress: null,
      walletVerified: false,
    },
  });

  return sanitizeUser(updatedUser);
}

// ---------------------------------------------------------------------------
// getWalletBalance
// ---------------------------------------------------------------------------

async function getWalletBalance(walletAddress: string) {
  const connection = getConnection();
  const publicKey = new PublicKey(walletAddress);

  // Get SOL balance (in lamports, convert to SOL)
  const lamports = await connection.getBalance(publicKey);
  const sol = lamports / 1e9;

  // Get USDC balance
  let usdc = 0;
  try {
    const usdcMint = getUsdcMint();
    const tokenAccounts = await connection.getTokenAccountsByOwner(publicKey, {
      mint: usdcMint,
    });

    if (tokenAccounts.value.length > 0) {
      // Parse the account data to get the token amount
      // Token account data layout: 64 bytes mint, 32 bytes owner, 8 bytes amount (little-endian u64)
      const accountData = tokenAccounts.value[0].account.data;
      const rawAmount = accountData.readBigUInt64LE(64);
      // USDC has 6 decimals
      usdc = Number(rawAmount) / 1e6;
    }
  } catch (err) {
    console.error("[wallet] Failed to fetch USDC balance:", err);
    // Return 0 for USDC if we can't fetch it
  }

  return { sol, usdc };
}

// ---------------------------------------------------------------------------
// ETH Wallet
// ---------------------------------------------------------------------------

const ETH_EXPECTED_MESSAGE =
  "Sign this message to verify Ethereum wallet ownership for CryptoMeet.";

async function verifyAndConnectEth(
  userId: string,
  walletAddress: string,
  signature: string,
  message: string
) {
  if (message !== ETH_EXPECTED_MESSAGE) {
    throw new AppError("Invalid verification message", 400, "BAD_REQUEST");
  }

  // Recover the signer address from the signature
  let recoveredAddress: string;
  try {
    recoveredAddress = ethers.verifyMessage(message, signature);
  } catch {
    throw new AppError("Invalid signature", 400, "BAD_REQUEST");
  }

  if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new AppError("Signature does not match wallet address", 401, "UNAUTHORIZED");
  }

  // Check if already connected to another user
  const existing = await prisma.user.findUnique({
    where: { ethWalletAddress: walletAddress.toLowerCase() },
  });
  if (existing && existing.id !== userId) {
    throw new AppError("This ETH wallet is already connected to another account", 409, "CONFLICT");
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ethWalletAddress: walletAddress.toLowerCase(),
      ethWalletVerified: true,
    },
  });

  return sanitizeUser(updatedUser);
}

async function disconnectEthWallet(userId: string) {
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ethWalletAddress: null,
      ethWalletVerified: false,
    },
  });
  return sanitizeUser(updatedUser);
}

async function getEthBalance(walletAddress: string) {
  const rpcUrl = process.env.ETH_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const balanceWei = await provider.getBalance(walletAddress);
  const eth = Number(ethers.formatEther(balanceWei));

  // USDC on Sepolia
  let usdc = 0;
  try {
    const usdcAddress = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
    const erc20 = new ethers.Contract(
      usdcAddress,
      ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
      provider
    );
    const bal = await erc20.balanceOf(walletAddress);
    const dec = await erc20.decimals();
    usdc = Number(ethers.formatUnits(bal, dec));
  } catch {
    // USDC fetch failed
  }

  // USDT on Sepolia
  let usdt = 0;
  try {
    const usdtAddress = "0xB59D7944722C02d212b2D85986154ECa8FF573be"; // deployed test USDT
    const erc20 = new ethers.Contract(
      usdtAddress,
      ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
      provider
    );
    const bal = await erc20.balanceOf(walletAddress);
    const dec = await erc20.decimals();
    usdt = Number(ethers.formatUnits(bal, dec));
  } catch {
    // USDT fetch failed
  }

  return { eth, usdc, usdt };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const walletService = {
  verifyAndConnect,
  disconnectWallet,
  getWalletBalance,
  verifyAndConnectEth,
  disconnectEthWallet,
  getEthBalance,
};
