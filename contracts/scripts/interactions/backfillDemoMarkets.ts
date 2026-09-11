import { ethers as ethersLib } from "ethers";
import { getMarkets, logContext } from "./common";

/**
 * One-off backfill: persists markets 2-5 (created by createDemoMarkets.ts
 * before the bigint-serialization bug was fixed) to Firestore, reading the
 * exact on-chain deadline/threshold back from getMarket() so the record
 * matches chain state precisely.
 *
 *   npx hardhat run scripts/interactions/backfillDemoMarkets.ts --network creditcoinTestnet
 */

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");
const AAVE_V3_POOL = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";
const AAVE_SUPPLY_SIG = "0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61";
const AAVE_BORROW_SIG = "0xb3d084820fb1a9decffb176436bd02558d15fac9b0ddfed8c465bc7359d7dce0";

const BACKFILL = [
  {
    marketId: "2",
    txHash: "0xd4872da4e365836661e65ba6946a61548723d3cee3c92cc17be0c07be503b850",
    preset: "aave-volume",
    marketType: "Cumulative" as const,
    eventTemplate: "AddressPrefixedValue" as const,
    comparisonOperator: "GTE" as const,
    sourceContract: AAVE_V3_POOL,
    eventSignature: AAVE_SUPPLY_SIG,
    watchedAddress: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8", // USDC
    thresholdDisplay: "10000",
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    question: "Will total supply volume of USDC on Aave reach at least 10000 USDC before the deadline?",
  },
  {
    marketId: "3",
    txHash: "0x6a9a75b39f9e3d0d3022d27f424e74d151bfc4a0d0a2aedd8576c49e7ee4cb9d",
    preset: "aave-volume",
    marketType: "Cumulative" as const,
    eventTemplate: "AddressPrefixedValue" as const,
    comparisonOperator: "GTE" as const,
    sourceContract: AAVE_V3_POOL,
    eventSignature: AAVE_BORROW_SIG,
    watchedAddress: "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c", // WETH
    thresholdDisplay: "5",
    tokenSymbol: "WETH",
    tokenDecimals: 18,
    question: "Will total borrow volume of WETH on Aave reach at least 5 WETH before the deadline?",
  },
  {
    marketId: "4",
    txHash: "0x44d8454c48b95d71d2efec6c4a547a35902a9963656b68a98262b649a4f033ae",
    preset: "aave-activity",
    marketType: "Cumulative" as const,
    eventTemplate: "EventCount" as const,
    comparisonOperator: "GTE" as const,
    sourceContract: AAVE_V3_POOL,
    eventSignature: AAVE_SUPPLY_SIG,
    watchedAddress: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357", // DAI
    thresholdDisplay: "5",
    tokenSymbol: "DAI",
    tokenDecimals: 18,
    question: "Will DAI see at least 5 supply events on Aave before the deadline?",
  },
  {
    marketId: "5",
    txHash: "0xf80da758172ae7eadc3feea43e3f3e9ce36a00016e174c023b33896e6c966448",
    preset: "aave-activity",
    marketType: "Cumulative" as const,
    eventTemplate: "EventCount" as const,
    comparisonOperator: "GTE" as const,
    sourceContract: AAVE_V3_POOL,
    eventSignature: AAVE_BORROW_SIG,
    watchedAddress: "0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5", // LINK
    thresholdDisplay: "3",
    tokenSymbol: "LINK",
    tokenDecimals: 18,
    question: "Will LINK see at least 3 borrow events on Aave before the deadline?",
  },
];

async function main() {
  const signer = await logContext("backfillDemoMarkets");
  const markets = await getMarkets();

  for (const b of BACKFILL) {
    console.log(`\n──────────── market ${b.marketId} ────────────`);
    const m = await markets.getMarket(BigInt(b.marketId));

    const payload = {
      marketId: b.marketId,
      creator: signer.address,
      txHash: b.txHash,
      question: b.question,
      preset: b.preset,
      marketType: b.marketType,
      eventTemplate: b.eventTemplate,
      comparisonOperator: b.comparisonOperator,
      chainKey: m.chainKey.toString(),
      sourceContract: b.sourceContract,
      eventSignature: b.eventSignature,
      watchedAddress: b.watchedAddress,
      threshold: m.threshold.toString(),
      thresholdDisplay: b.thresholdDisplay,
      tokenSymbol: b.tokenSymbol,
      tokenDecimals: b.tokenDecimals,
      deadline: m.deadline.toString(),
    };

    console.log("on-chain deadline:", m.deadline.toString(), new Date(Number(m.deadline) * 1000).toISOString());
    console.log("on-chain threshold:", m.threshold.toString());

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
