import hre from "hardhat";
import { getMarkets, logContext, MarketStatus } from "./common";

/**
 * Claims a payout from a resolved market.
 *
 *   MARKET_ID=1 npx hardhat run scripts/interactions/claim.ts --network creditcoinTestnet
 */
async function main() {
  const signer = await logContext("claim");
  const markets = await getMarkets();

  if (process.env.MARKET_ID === undefined) throw new Error("Set MARKET_ID");
  const marketId = BigInt(process.env.MARKET_ID);

  const m = await markets.getMarket(marketId);
  console.log(`market ${marketId}:`, {
    status: Number(m.status),
    resolved: Number(m.status) === MarketStatus.Resolved,
    outcome: m.outcome,
    yesPool: hre.ethers.formatEther(m.yesPool),
    noPool: hre.ethers.formatEther(m.noPool),
  });

  const yesStake = await markets.stakes(marketId, signer.address, true);
  const noStake = await markets.stakes(marketId, signer.address, false);
  const already = await markets.claimed(marketId, signer.address);
  console.log(`your stakes — YES ${hre.ethers.formatEther(yesStake)} / NO ${hre.ethers.formatEther(noStake)} CTC; claimed=${already}`);

  const balBefore = await hre.ethers.provider.getBalance(signer.address);

  await markets.claim.staticCall(marketId);
  console.log("static call OK");

  const tx = await markets.claim(marketId);
  console.log(`tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`mined in block ${receipt?.blockNumber}, gas used ${receipt?.gasUsed}`);

  const claimedEvt = receipt?.logs
    .map((l) => {
      try {
        return markets.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p) => p?.name === "Claimed");
  if (claimedEvt) {
    console.log(`\nClaimed: bettor=${claimedEvt.args.bettor} amount=${hre.ethers.formatEther(claimedEvt.args.amount)} CTC`);
  }

  const balAfter = await hre.ethers.provider.getBalance(signer.address);
  console.log(`balance ${hre.ethers.formatEther(balBefore)} -> ${hre.ethers.formatEther(balAfter)} CTC (net of gas)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
