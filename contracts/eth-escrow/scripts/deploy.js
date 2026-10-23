const hre = require("hardhat");

async function main() {
  console.log("Deploying MerlinkEscrow...");

  const ADMIN_ADDRESS = "0xd4cA389198B47afd323AAeFbAd24daA6257010ca";
  const MerlinkEscrow = await hre.ethers.getContractFactory("MerlinkEscrow");
  const escrow = await MerlinkEscrow.deploy(ADMIN_ADDRESS);
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log("MerlinkEscrow deployed to:", address);
  console.log("Admin:", await escrow.admin());

  // Save ABI for frontend
  const fs = require("fs");
  const artifact = require("../artifacts/contracts/MerlinkEscrow.sol/MerlinkEscrow.json");
  fs.writeFileSync(
    "../../../apps/web/src/lib/escrow/eth-abi.json",
    JSON.stringify(artifact.abi, null, 2)
  );
  console.log("ABI saved to apps/web/src/lib/escrow/eth-abi.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
