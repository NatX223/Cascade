const hre = require("hardhat");

async function main() {
  const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
  const ONE_GWEI = 1_000_000_000n;

  const unlockTime = Math.floor(Date.now() / 1000) + ONE_YEAR_IN_SECS;

  const lock = await hre.ethers.deployContract("Lock", [unlockTime], {
    value: ONE_GWEI,
  });
  await lock.waitForDeployment();

  console.log(`Lock deployed to ${await lock.getAddress()}, unlocking at ${unlockTime}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
