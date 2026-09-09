import hre from "hardhat";
import { getMarkets, logContext, MarketStatus } from "./common";

/**
 * Places a bet on an existing market.
 *
 *   MARKET_ID=0 OUTCOME=yes AMOUNT=0.001 \
 *     npx hardhat run scripts/interactions/bet.ts --network creditcoinTestnet
 *
 *   MARKET_ID    required — the market to bet on
 *   OUTCOME      "yes" | "no" | "true" | "false"   (default "yes")
 *   AMOUNT       stake in CTC (default "0.001")
 */
async function main() {
  const signer = await logContext("bet");
  const markets = await getMarkets();

  if (process.env.MARKET_ID === undefined) {
    throw new Error("Set MARKET_ID (e.g. MARKET_ID=0 ...)");
  }
  const marketId = BigInt(process.env.MARKET_ID);
  const outcomeRaw = (process.env.OUTCOME ?? "yes").toLowerCase();
  const outcome = outcomeRaw === "yes" || outcomeRaw === "true";
  const amount = hre.ethers.parseEther(process.env.AMOUNT ?? "0.001");

  const before = await markets.getMarket(marketId);
  if (before.creator === hre.ethers.ZeroAddress) {
    throw new Error(`market ${marketId} does not exist`);
  }
  console.log(`market ${marketId} before:`, {
    status: Number(before.status),
    open: Number(before.status) === MarketStatus.Open,
    deadline: before.deadline.toString(),
    now: Math.floor(Date.now() / 1000),
    yesPool: hre.ethers.formatEther(before.yesPool),
    noPool: hre.ethers.formatEther(before.noPool),
  });

  console.log(`\nbetting ${hre.ethers.formatEther(amount)} CTC on ${outcome ? "YES" : "NO"}`);

  // Static call first to surface reverts (MarketNotOpen, MarketExpired, ...).
  await markets.bet.staticCall(marketId, outcome, { value: amount });
  console.log("static call OK");

  const tx = await markets.bet(marketId, outcome, { value: amount });
  console.log(`tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`mined in block ${receipt?.blockNumber}, gas used ${receipt?.gasUsed}`);

  const placed = receipt?.logs
    .map((l) => {
      try {
        return markets.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p) => p?.name === "BetPlaced");
  if (placed) {
    console.log(`\nBetPlaced: bettor=${placed.args.bettor} outcome=${placed.args.outcome} amount=${placed.args.amount}`);
  }

  const after = await markets.getMarket(marketId);
  console.log(`\nmarket ${marketId} after:`, {
    yesPool: hre.ethers.formatEther(after.yesPool),
    noPool: hre.ethers.formatEther(after.noPool),
  });
  const myStake = await markets.stakes(marketId, signer.address, outcome);
  console.log(`your ${outcome ? "YES" : "NO"} stake: ${hre.ethers.formatEther(myStake)} CTC`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
