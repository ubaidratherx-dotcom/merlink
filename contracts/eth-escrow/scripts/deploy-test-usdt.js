const hre = require("hardhat");

async function main() {
  console.log("Deploying Test USDT on Sepolia...");

  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  const usdt = await MockERC20.deploy("Test USDT", "USDT", 6);
  await usdt.waitForDeployment();
  const address = await usdt.getAddress();
  console.log("Test USDT deployed to:", address);

  // Mint to both test wallets
  const seller = "0xd4cA389198B47afd323AAeFbAd24daA6257010ca"; // testuser1
  const buyer = "0x317411cdeb3d307a6dd9500ba1b909e8ce5e349b"; // tvs

  let tx = await usdt.mint(seller, 10000000000n); // 10,000 USDT (6 decimals)
  await tx.wait();
  console.log("Minted 10,000 USDT to", seller);

  tx = await usdt.mint(buyer, 5000000000n); // 5,000 USDT
  await tx.wait();
  console.log("Minted 5,000 USDT to", buyer);

  // Whitelist on escrow contract
  const escrowAbi = require("../artifacts/contracts/MerlinkEscrow.sol/MerlinkEscrow.json").abi;
  const escrow = new hre.ethers.Contract("0xea9ffa35b1030e895c096ea1993149376287D226", escrowAbi, (await hre.ethers.getSigners())[0]);
  tx = await escrow.setTokenAllowed(address, true);
  await tx.wait();
  console.log("USDT whitelisted on escrow contract");

  console.log("\nUpdate eth-escrow.ts USDT_SEPOLIA to:", address);
}

main().catch(console.error);
