const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await deployer.getBalance();
  console.log(`Wallet address: ${deployer.address}`);
  console.log(`Balance: ${ethers.utils.formatEther(balance)} TCORE`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
