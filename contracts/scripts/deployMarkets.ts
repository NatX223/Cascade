import hre from "hardhat";

/**
 * Deploys the `Markets` contract and (on a live network) verifies it on Blockscout.
 *
 *   npx hardhat run scripts/deployMarkets.ts --network creditcoinTestnet
 *
 * The constructor takes no arguments: the sending account becomes `owner`.
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log(`Deploying Markets to "${network}" from ${deployer.address}`);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Deployer balance: ${hre.ethers.formatEther(balance)}`);

  const markets = await hre.ethers.deployContract("Markets");
  await markets.waitForDeployment();

  const address = await markets.getAddress();
  const deployTx = markets.deploymentTransaction();
  console.log(`Markets deployed to ${address} (tx ${deployTx?.hash})`);

  // Skip verification on the in-process Hardhat network.
  if (network === "hardhat" || network === "localhost") return;

  console.log("Waiting 5 confirmations before verification...");
  await deployTx?.wait(5);

  try {
    await hre.run("verify:verify", { address, constructorArguments: [] });
    console.log("Verified on Blockscout");
  } catch (err) {
    console.warn("Verification failed (contract is still deployed):", err);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
