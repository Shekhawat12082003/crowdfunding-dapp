const hre = require("hardhat");

async function main() {
  const CrowdfundingDapp = await hre.ethers.getContractFactory("CrowdfundingDapp");
  const contract = await CrowdfundingDapp.deploy();
  await contract.deployed();
  console.log("Contract deployed to:", contract.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
