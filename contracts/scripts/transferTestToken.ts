import hre from "hardhat";

/**
 * Sends TestToken from the signer to a recipient — this is the on-chain action
 * that fires the `Transfer` event a Cascade market watches, so the source
 * watcher can match it and the resolver can prove it.
 *
 *   TOKEN_ADDRESS=0x... TRANSFER_AMOUNT=1000 npx hardhat run scripts/transferTestToken.ts --network sepolia
 *
 * Env:
 *   TOKEN_ADDRESS     (required) deployed TestToken address
 *   TRANSFER_AMOUNT   whole tokens to send (default 1000)
 *   TRANSFER_TO       recipient (default: a burn-ish placeholder 0x000...dead)
 */
async function main() {
  const [signer] = await hre.ethers.getSigners();

  const tokenAddress = process.env.TOKEN_ADDRESS;
  if (!tokenAddress) throw new Error("set TOKEN_ADDRESS");

  const amount = BigInt(process.env.TRANSFER_AMOUNT ?? "1000");
  const to = process.env.TRANSFER_TO ?? "0x000000000000000000000000000000000000dEaD";

  const token = await hre.ethers.getContractAt("TestToken", tokenAddress);
  const decimals: bigint = await token.decimals();
  const raw = amount * 10n ** decimals;

  const before = await token.balanceOf(signer.address);
  console.log(`Sending ${amount} CTT from ${signer.address} -> ${to} on ${hre.network.name}`);
  console.log(`sender balance before: ${hre.ethers.formatUnits(before, decimals)} CTT`);

  const tx = await token.transfer(to, raw);
  console.log(`\ntx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`mined in block ${receipt?.blockNumber}`);
  console.log(`\nThis is the source tx to resolve against:`);
  console.log(`  txHash:  ${tx.hash}`);
  console.log(`  from:    ${signer.address}  (matches WATCHED_ADDRESS)`);
  console.log(`  value:   ${raw}  (raw, 18-dec)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
