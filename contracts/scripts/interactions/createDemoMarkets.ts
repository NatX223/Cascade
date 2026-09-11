import { ethers as ethersLib } from "ethers";
import { getMarkets, logContext, MarketType, EventTemplate, ComparisonOperator } from "./common";

/**
 * Creates a fixed batch of demo markets on the live Markets contract and
 * persists each one to the backend's Firestore-backed /markets endpoint, so
 * the frontend can render the human-readable question immediately.
 *
 *   npx hardhat run scripts/interactions/createDemoMarkets.ts --network creditcoinTestnet
 *
 * Requires the backend dev server running locally (POST http://localhost:4000/markets)
 * with CRED configured. Override with BACKEND_URL.
 *
 * Reads reserve-token decimals/symbol live from Sepolia (read-only, no signer
 * needed there) so thresholds are computed in the token's real raw units.
 */

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

const AAVE_V3_POOL = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";
const AAVE_SUPPLY_SIG = "0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61";
const AAVE_BORROW_SIG = "0xb3d084820fb1a9decffb176436bd02558d15fac9b0ddfed8c465bc7359d7dce0";
const SEPOLIA_CHAIN_KEY = 1n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const erc20Abi = ["function decimals() view returns (uint8)", "function symbol() view returns (string)"];

type DemoMarket = {
  label: string;
  preset: string;
  marketType: number;
  eventTemplate: number;
  sourceContract: string;
  eventSignature: string;
  watchedAddress: string;
  comparisonOperator: number;
  comparisonName: "GTE" | "LTE" | "EQ";
  // Either a fixed raw threshold, or a human amount to be scaled by the
  // watched token's decimals (resolved right before the tx).
  thresholdRaw?: bigint;
  thresholdHuman?: string;
  deadlineSeconds: number; // from now
  questionTemplate: (sym: string | null) => string;
  tokenAddressForDecimals?: string; // if set, fetched from Sepolia for display + scaling
};

const MARKETS: DemoMarket[] = [
  {
    label: "1. Aave USDC supply volume",
    preset: "aave-volume",
    marketType: MarketType.Cumulative,
    eventTemplate: EventTemplate.AddressPrefixedValue,
    sourceContract: AAVE_V3_POOL,
    eventSignature: AAVE_SUPPLY_SIG,
    watchedAddress: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8", // USDC
    comparisonOperator: ComparisonOperator.GTE,
    comparisonName: "GTE",
    thresholdHuman: "10000",
    tokenAddressForDecimals: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
    deadlineSeconds: 3 * 24 * 60 * 60,
    questionTemplate: (sym) => `Will total supply volume of ${sym ?? "USDC"} on Aave reach at least 10000 ${sym ?? "USDC"} before the deadline?`,
  },
  {
    label: "2. Aave WETH borrow volume",
    preset: "aave-volume",
    marketType: MarketType.Cumulative,
    eventTemplate: EventTemplate.AddressPrefixedValue,
    sourceContract: AAVE_V3_POOL,
    eventSignature: AAVE_BORROW_SIG,
    watchedAddress: "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c", // WETH
    comparisonOperator: ComparisonOperator.GTE,
    comparisonName: "GTE",
    thresholdHuman: "5",
    tokenAddressForDecimals: "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c",
    deadlineSeconds: 3 * 24 * 60 * 60,
    questionTemplate: (sym) => `Will total borrow volume of ${sym ?? "WETH"} on Aave reach at least 5 ${sym ?? "WETH"} before the deadline?`,
  },
  {
    label: "3. Aave DAI supply activity",
    preset: "aave-activity",
    marketType: MarketType.Cumulative,
    eventTemplate: EventTemplate.EventCount,
    sourceContract: AAVE_V3_POOL,
    eventSignature: AAVE_SUPPLY_SIG,
    watchedAddress: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357", // DAI
    comparisonOperator: ComparisonOperator.GTE,
    comparisonName: "GTE",
    thresholdRaw: 5n,
    tokenAddressForDecimals: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357",
    deadlineSeconds: 2 * 24 * 60 * 60,
    questionTemplate: (sym) => `Will ${sym ?? "DAI"} see at least 5 supply events on Aave before the deadline?`,
  },
  {
    label: "4. Aave LINK borrow activity",
    preset: "aave-activity",
    marketType: MarketType.Cumulative,
    eventTemplate: EventTemplate.EventCount,
    sourceContract: AAVE_V3_POOL,
    eventSignature: AAVE_BORROW_SIG,
    watchedAddress: "0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5", // LINK
    comparisonOperator: ComparisonOperator.GTE,
    comparisonName: "GTE",
    thresholdRaw: 3n,
    tokenAddressForDecimals: "0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5",
    deadlineSeconds: 2 * 24 * 60 * 60,
    questionTemplate: (sym) => `Will ${sym ?? "LINK"} see at least 3 borrow events on Aave before the deadline?`,
  },
  {
    label: "5. Aave pool-wide supply activity",
    preset: "aave-pool-activity",
    marketType: MarketType.Cumulative,
    eventTemplate: EventTemplate.EventCount,
    sourceContract: AAVE_V3_POOL,
    eventSignature: AAVE_SUPPLY_SIG,
    watchedAddress: ZERO_ADDRESS,
    comparisonOperator: ComparisonOperator.GTE,
    comparisonName: "GTE",
    thresholdRaw: 20n,
    deadlineSeconds: 5 * 24 * 60 * 60,
    questionTemplate: () => `Will the whole Aave pool see at least 20 supply events before the deadline?`,
  },
];

async function main() {
  const signer = await logContext("createDemoMarkets");
  const markets = await getMarkets();
  const sepoliaProvider = new ethersLib.JsonRpcProvider(SEPOLIA_RPC_URL);

  for (const m of MARKETS) {
    console.log(`\n──────────── ${m.label} ────────────`);

    let symbol: string | null = null;
    let decimals: number | null = null;
    if (m.tokenAddressForDecimals) {
      const token = new ethersLib.Contract(m.tokenAddressForDecimals, erc20Abi, sepoliaProvider);
      const [sym, dec] = await Promise.all([token.symbol(), token.decimals()]);
      symbol = sym as string;
      decimals = Number(dec); // ethers v6 returns uint8 as bigint — JSON.stringify can't serialize that
      console.log(`token: ${symbol} (${decimals} decimals) @ ${m.tokenAddressForDecimals}`);
    }

    const threshold = m.thresholdRaw ?? ethersLib.parseUnits(m.thresholdHuman!, decimals ?? 18);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + m.deadlineSeconds);
    const question = m.questionTemplate(symbol);

    const args = [
      m.marketType,
      m.eventTemplate,
      SEPOLIA_CHAIN_KEY,
      m.sourceContract,
      m.eventSignature,
      m.watchedAddress,
      m.comparisonOperator,
      threshold,
      deadline,
    ] as const;

    console.log("question:", question);
    console.log("threshold (raw):", threshold.toString());

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

    const marketTypeName = m.marketType === MarketType.SingleEvent ? "SingleEvent" : "Cumulative";
    const eventTemplateName =
      m.eventTemplate === EventTemplate.Occurrence
        ? "Occurrence"
        : m.eventTemplate === EventTemplate.SingleWordValue
          ? "SingleWordValue"
          : m.eventTemplate === EventTemplate.AddressPrefixedValue
            ? "AddressPrefixedValue"
            : "EventCount";

    const payload = {
      marketId: marketId.toString(),
      creator: signer.address,
      txHash: tx.hash,
      question,
      preset: m.preset,
      marketType: marketTypeName,
      eventTemplate: eventTemplateName,
      comparisonOperator: m.comparisonName,
      chainKey: SEPOLIA_CHAIN_KEY.toString(),
      sourceContract: m.sourceContract,
      eventSignature: m.eventSignature,
      watchedAddress: m.watchedAddress,
      threshold: threshold.toString(),
      thresholdDisplay: m.thresholdHuman ?? m.thresholdRaw?.toString(),
      tokenSymbol: symbol ?? undefined,
      tokenDecimals: decimals ?? undefined,
      deadline: deadline.toString(),
    };

    try {
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
    } catch (err) {
      console.warn("Firestore persist request failed:", err);
    }
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
