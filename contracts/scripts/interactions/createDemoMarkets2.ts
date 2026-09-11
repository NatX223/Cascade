import { getMarkets, logContext, MarketType, EventTemplate, ComparisonOperator } from "./common";

/**
 * Batch 2 of demo markets: Uniswap V3 swap-count markets (6, 7), on the two
 * substitute pool addresses given (not the originally intended USDC/WETH /
 * DAI/USDC pairs — the real token pairs were read live from Sepolia and
 * folded into the question text).
 *
 *   npx hardhat run scripts/interactions/createDemoMarkets2.ts --network creditcoinTestnet
 */

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");
const UNISWAP_V3_SWAP_SIG = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const MARKETS = [
  {
    label: "6. Uniswap X28/HORIZON swap count",
    poolAddress: "0x736eaB5d426a18e5D867F1d6dBDA270efCDD3DD4",
    threshold: 15n,
    deadlineSeconds: 3 * 24 * 60 * 60,
    question: "Will the X28/HORIZON Uniswap V3 pool (1% fee) see at least 15 swaps before the deadline?",
  },
  {
    label: "7. Uniswap HORIZON/USDx swap count",
    poolAddress: "0x46BF451FC5FE9C69925004842Ff556788dCAb451",
    threshold: 10n,
    deadlineSeconds: 3 * 24 * 60 * 60,
    question: "Will the HORIZON/USDx Uniswap V3 pool (1% fee) see at least 10 swaps before the deadline?",
  },
];

async function main() {
  const signer = await logContext("createDemoMarkets2");
  const markets = await getMarkets();

  for (const m of MARKETS) {
    console.log(`\n──────────── ${m.label} ────────────`);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + m.deadlineSeconds);
    const args = [
      MarketType.Cumulative,
      EventTemplate.EventCount,
      1n, // Sepolia chainKey
      m.poolAddress,
      UNISWAP_V3_SWAP_SIG,
      ZERO_ADDRESS,
      ComparisonOperator.GTE,
      m.threshold,
      deadline,
    ] as const;

    console.log("question:", m.question);
    console.log("threshold:", m.threshold.toString());

    const predictedId = await markets.createMarket.staticCall(...args);
    console.log(`static call OK — predicted marketId: ${predictedId}`);

    const tx = await markets.createMarket(...args);
    console.log(`tx sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`mined in block ${receipt?.blockNumber}, gas used ${receipt?.gasUsed}`);

    const created = receipt?.logs
      .map((l) => {
        try {
          return markets.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((p) => p?.name === "MarketCreated");

    const marketId = created ? created.args.marketId : predictedId;
    console.log(`MarketCreated: marketId=${marketId}`);

    const payload = {
      marketId: marketId.toString(),
      creator: signer.address,
      txHash: tx.hash,
      question: m.question,
      preset: "uniswap-swaps",
      marketType: "Cumulative",
      eventTemplate: "EventCount",
      comparisonOperator: "GTE",
      chainKey: "1",
      sourceContract: m.poolAddress,
      eventSignature: UNISWAP_V3_SWAP_SIG,
      watchedAddress: ZERO_ADDRESS,
      threshold: m.threshold.toString(),
      thresholdDisplay: m.threshold.toString(),
      deadline: deadline.toString(),
    };

    const res = await fetch(`${BACKEND_URL}/markets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn(`Firestore persist FAILED (${res.status}):`, body);
    } else {
      console.log("Firestore persist OK:", body);
    }
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
