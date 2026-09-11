import hre from "hardhat";
import {
  getMarkets,
  logContext,
  MarketType,
  EventTemplate,
  ComparisonOperator,
  ERC20_TRANSFER_SIG,
} from "./common";

/**
 * Creates one prediction market on the live contract.
 *
 *   npx hardhat run scripts/interactions/createMarket.ts --network creditcoinTestnet
 *
 * Defaults to an `Occurrence` market (resolves YES on the first attested matching
 * event), which needs no threshold. Override any field via env vars:
 *
 *   CHAIN_KEY, SOURCE_CONTRACT, EVENT_SIG, WATCHED_ADDRESS,
 *   THRESHOLD, DEADLINE_SECONDS (seconds from now, default 1 day)
 *   MARKET_TYPE      SingleEvent | Cumulative           (default SingleEvent)
 *   EVENT_TEMPLATE   Occurrence | SingleWordValue | AddressPrefixedValue | EventCount
 *   COMPARISON       GTE | LTE | EQ                      (default GTE)
 *
 * Example — "does <addr> send >= 500 CTT" on a Sepolia TestToken:
 *   SOURCE_CONTRACT=<token> WATCHED_ADDRESS=<sender> EVENT_TEMPLATE=SingleWordValue \
 *   THRESHOLD=500000000000000000000 CHAIN_KEY=<sepolia attestcoin key> npm run market:create
 */
async function main() {
  const signer = await logContext("createMarket");
  const markets = await getMarkets();

  const chainKey = BigInt(process.env.CHAIN_KEY ?? "1");
  const sourceContract =
    process.env.SOURCE_CONTRACT ?? "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951"; // AAVE_V3_POOL constant
  const eventSignature = process.env.EVENT_SIG ?? ERC20_TRANSFER_SIG;
  const watchedAddress = process.env.WATCHED_ADDRESS ?? hre.ethers.ZeroAddress;
  const threshold = BigInt(process.env.THRESHOLD ?? "0");
  const deadlineSeconds = Number(process.env.DEADLINE_SECONDS ?? 24 * 60 * 60);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

  const marketTypeName = (process.env.MARKET_TYPE ?? "SingleEvent") as keyof typeof MarketType;
  const eventTemplateName = (process.env.EVENT_TEMPLATE ?? "Occurrence") as keyof typeof EventTemplate;
  const comparisonName = (process.env.COMPARISON ?? "GTE") as keyof typeof ComparisonOperator;
  const marketType = MarketType[marketTypeName];
  const eventTemplate = EventTemplate[eventTemplateName];
  const comparisonOperator = ComparisonOperator[comparisonName];
  if (marketType === undefined) throw new Error(`bad MARKET_TYPE: ${process.env.MARKET_TYPE}`);
  if (eventTemplate === undefined) throw new Error(`bad EVENT_TEMPLATE: ${process.env.EVENT_TEMPLATE}`);
  if (comparisonOperator === undefined) throw new Error(`bad COMPARISON: ${process.env.COMPARISON}`);

  const args = [
    marketType,
    eventTemplate,
    chainKey,
    sourceContract,
    eventSignature,
    watchedAddress,
    comparisonOperator,
    threshold,
    deadline,
  ] as const;

  console.log("createMarket args:", {
    marketType: marketTypeName,
    eventTemplate: eventTemplateName,
    chainKey: chainKey.toString(),
    sourceContract,
    eventSignature,
    watchedAddress,
    comparisonOperator: comparisonName,
    threshold: threshold.toString(),
    deadline: deadline.toString(),
  });

  // Static call first to surface a revert reason without spending gas.
  const predictedId = await markets.createMarket.staticCall(...args);
  console.log(`\nstatic call OK — predicted marketId: ${predictedId}`);

  const tx = await markets.createMarket(...args);
  console.log(`tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`mined in block ${receipt?.blockNumber}, gas used ${receipt?.gasUsed}`);

  // Pull the real id out of the MarketCreated event.
  const created = receipt?.logs
    .map((l) => {
      try {
        return markets.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p) => p?.name === "MarketCreated");

  if (created) {
    console.log(`\nMarketCreated: marketId=${created.args.marketId}`);
  }

  const nextId = await markets.nextMarketId();
  console.log(`nextMarketId is now ${nextId}`);

  const marketId = created ? created.args.marketId : nextId - 1n;
  const m = await markets.getMarket(marketId);
  console.log(`\ngetMarket(${marketId}):`, {
    status: m.status,
    creator: m.creator,
    deadline: m.deadline.toString(),
    yesPool: m.yesPool.toString(),
    noPool: m.noPool.toString(),
  });
  console.log(`\nBet on it with:  MARKET_ID=${marketId} npx hardhat run scripts/interactions/bet.ts --network ${hre.network.name}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
