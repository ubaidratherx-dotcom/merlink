import { BrowserProvider, Contract, parseEther, parseUnits, formatEther, formatUnits, id as keccak256, toUtf8Bytes, zeroPadBytes } from "ethers";
import ethAbi from "./eth-abi.json";

const ETH_ESCROW_ADDRESS =
  process.env.NEXT_PUBLIC_ETH_ESCROW_ADDRESS ||
  "0xea9ffa35b1030e895c096ea1993149376287D226";

// Sepolia token addresses
const USDC_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const USDT_SEPOLIA = "0xB59D7944722C02d212b2D85986154ECa8FF573be"; // deployed test USDT

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];

function getTradeIdBytes32(tradeId: string): string {
  // Pad trade ID to bytes32
  const bytes = toUtf8Bytes(tradeId);
  return zeroPadBytes(bytes.length > 32 ? bytes.slice(0, 32) : bytes, 32);
}

function getTokenAddress(asset: string): string | null {
  if (asset === "USDC") return USDC_SEPOLIA;
  if (asset === "USDT") return USDT_SEPOLIA;
  return null;
}

async function getContract(signer: any) {
  return new Contract(ETH_ESCROW_ADDRESS, ethAbi, signer);
}

async function getSigner() {
  if (!(window as any).ethereum) {
    throw new Error("No Ethereum wallet found. Please install MetaMask or use WalletConnect.");
  }
  const provider = new BrowserProvider((window as any).ethereum);
  await provider.send("eth_requestAccounts", []);

  // Ensure we're on Sepolia (chainId 11155111)
  const network = await provider.getNetwork();
  if (network.chainId !== 11155111n) {
    try {
      await provider.send("wallet_switchEthereumChain", [{ chainId: "0xaa36a7" }]);
    } catch {
      throw new Error("Please switch to Sepolia network in your wallet");
    }
  }

  return provider.getSigner();
}

// ─── Lock ────────────────────────────────────────────────

export async function lockEthEscrow(
  tradeId: string,
  buyerAddress: string,
  amountEth: number
): Promise<string> {
  const signer = await getSigner();
  const contract = await getContract(signer);
  const tradeIdBytes = getTradeIdBytes32(tradeId);

  const tx = await contract.lockEth(tradeIdBytes, buyerAddress, {
    value: parseEther(amountEth.toString()),
  });
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function lockTokenEscrow(
  tradeId: string,
  buyerAddress: string,
  tokenAsset: string,
  amount: number
): Promise<string> {
  const signer = await getSigner();
  const tokenAddress = getTokenAddress(tokenAsset);
  if (!tokenAddress) throw new Error(`Unsupported token: ${tokenAsset}`);

  // Get token decimals
  const tokenContract = new Contract(tokenAddress, ERC20_ABI, signer);
  const decimals = await tokenContract.decimals();
  const amountParsed = parseUnits(amount.toString(), decimals);

  // Approve escrow contract to spend tokens
  const signerAddress = await signer.getAddress();
  const currentAllowance = await tokenContract.allowance(signerAddress, ETH_ESCROW_ADDRESS);
  if (currentAllowance < amountParsed) {
    const approveTx = await tokenContract.approve(ETH_ESCROW_ADDRESS, amountParsed);
    await approveTx.wait();
  }

  // Lock
  const contract = await getContract(signer);
  const tradeIdBytes = getTradeIdBytes32(tradeId);
  const tx = await contract.lockToken(tradeIdBytes, buyerAddress, tokenAddress, amountParsed);
  const receipt = await tx.wait();
  return receipt.hash;
}

// ─── Mark Payment Sent ───────────────────────────────────

export async function markEthPaymentSent(tradeId: string): Promise<string> {
  const signer = await getSigner();
  const contract = await getContract(signer);
  const tradeIdBytes = getTradeIdBytes32(tradeId);

  const tx = await contract.markPaymentSent(tradeIdBytes);
  const receipt = await tx.wait();
  return receipt.hash;
}

// ─── Release ─────────────────────────────────────────────

export async function releaseEthEscrow(tradeId: string): Promise<string> {
  const signer = await getSigner();
  const contract = await getContract(signer);
  const tradeIdBytes = getTradeIdBytes32(tradeId);

  const tx = await contract.release(tradeIdBytes);
  const receipt = await tx.wait();
  return receipt.hash;
}

// ─── Cancel ──────────────────────────────────────────────

export async function cancelEthEscrow(tradeId: string): Promise<string> {
  const signer = await getSigner();
  const contract = await getContract(signer);
  const tradeIdBytes = getTradeIdBytes32(tradeId);

  const tx = await contract.cancel(tradeIdBytes);
  const receipt = await tx.wait();
  return receipt.hash;
}

// ─── Dispute ─────────────────────────────────────────────

export async function markEthDisputed(tradeId: string): Promise<string> {
  const signer = await getSigner();
  const contract = await getContract(signer);
  const tradeIdBytes = getTradeIdBytes32(tradeId);

  const tx = await contract.markDisputed(tradeIdBytes);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function disputeReleaseEth(tradeId: string): Promise<string> {
  const signer = await getSigner();
  const contract = await getContract(signer);
  const tradeIdBytes = getTradeIdBytes32(tradeId);

  const tx = await contract.disputeRelease(tradeIdBytes);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function disputeCancelEth(tradeId: string): Promise<string> {
  const signer = await getSigner();
  const contract = await getContract(signer);
  const tradeIdBytes = getTradeIdBytes32(tradeId);

  const tx = await contract.disputeCancel(tradeIdBytes);
  const receipt = await tx.wait();
  return receipt.hash;
}

// ─── View ────────────────────────────────────────────────

export async function getEthEscrowState(tradeId: string) {
  const provider = new BrowserProvider((window as any).ethereum);
  const contract = new Contract(ETH_ESCROW_ADDRESS, ethAbi, provider);
  const tradeIdBytes = getTradeIdBytes32(tradeId);

  const [seller, buyer, token, amount, isLocked, isReleased, isCancelled, isDisputed] =
    await contract.getEscrow(tradeIdBytes);

  return {
    seller,
    buyer,
    token,
    amount: token === "0x0000000000000000000000000000000000000000"
      ? formatEther(amount)
      : formatUnits(amount, 6),
    isLocked,
    isReleased,
    isCancelled,
    isDisputed,
  };
}

export {
  ETH_ESCROW_ADDRESS,
  USDC_SEPOLIA,
  USDT_SEPOLIA,
  getTradeIdBytes32,
  getTokenAddress,
};
