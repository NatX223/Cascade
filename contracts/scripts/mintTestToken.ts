import hre from "hardhat";

/**
 * Mints more TestToken to an address (owner-only on the contract).
 *
 *   TOKEN_ADDRESS=0x... MINT_AMOUNT=50000 npx hardhat run scripts/mintTestToken.ts --network sepolia
 *
 * Env:
 *   TOKEN_ADDRESS  (required) deployed TestToken address
 *   MINT_AMOUNT    whole tokens to mint (default 100000)
 *   MINT_TO        recipient (default: the signer)
 */
async function main() {
  const [signer] = await hre.ethers.getSigners();

  const tokenAddress = process.env.TOKEN_ADDRESS;
  if (!tokenAddress) throw new Error("set TOKEN_ADDRESS");

  const amount = BigInt(process.env.MINT_AMOUNT ?? "100000");
  const to = process.env.MINT_TO ?? signer.address;

  const token = await hre.ethers.getContractAt("TestToken", tokenAddress);

  console.log(`Minting ${amount} CTT to ${to} on ${hre.network.name}...`);
  const tx = await token.mint(to, amount);
  console.log(`tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`mined in block ${receipt?.blockNumber}`);

  const bal = await token.balanceOf(to);
  console.log(`balanceOf(${to}): ${hre.ethers.formatUnits(bal, 18)} CTT`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
