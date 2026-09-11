import hre from "hardhat";

/**
 * Deploys `TestToken` (ERC20, 18 decimals) and mints the initial supply to the
 * deployer. Intended for Sepolia, where its Transfer events become the source
 * condition for a Cascade market.
 *
 *   npx hardhat run scripts/deployTestToken.ts --network sepolia
 *
 * Env overrides:
 *   TOKEN_INITIAL_SUPPLY   whole tokens minted at deploy (default 1_000_000)
 *   TOKEN_INITIAL_HOLDER   who receives them (default: the deployer)
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  const initialSupply = BigInt(process.env.TOKEN_INITIAL_SUPPLY ?? "1000000");
  const initialHolder = process.env.TOKEN_INITIAL_HOLDER ?? hre.ethers.ZeroAddress;

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Deploying TestToken to "${network}" from ${deployer.address}`);
  console.log(`Deployer balance: ${hre.ethers.formatEther(balance)} ETH`);
  console.log(`Initial supply:   ${initialSupply} CTT -> ${initialHolder === hre.ethers.ZeroAddress ? deployer.address : initialHolder}`);

  const token = await hre.ethers.deployContract("TestToken", [initialHolder, initialSupply]);
  await token.waitForDeployment();

  const address = await token.getAddress();
  const deployTx = token.deploymentTransaction();
  console.log(`\nTestToken deployed to ${address} (tx ${deployTx?.hash})`);

  const holder = initialHolder === hre.ethers.ZeroAddress ? deployer.address : initialHolder;
  const held = await token.balanceOf(holder);
  console.log(`balanceOf(${holder}): ${hre.ethers.formatUnits(held, 18)} CTT`);

  console.log(`\nUse it as a market source:`);
  console.log(`  SOURCE_CONTRACT=${address} EVENT_SIG=<Transfer sig> WATCHED_ADDRESS=${holder} ...`);

  if (network === "hardhat" || network === "localhost") return;
  if (!process.env.ETHERSCAN_API_KEY) {
    console.log("\nETHERSCAN_API_KEY unset — skipping verification.");
    return;
  }

  console.log("\nWaiting 5 confirmations before verification...");
  await deployTx?.wait(5);
  try {
    await hre.run("verify:verify", {
      address,
      constructorArguments: [initialHolder, initialSupply],
    });
    console.log("Verified on Etherscan");
  } catch (err) {
    console.warn("Verification failed (contract is still deployed):", err);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
