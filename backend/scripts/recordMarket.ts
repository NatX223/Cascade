// One-off: persist an already-created on-chain market into Firestore, the
// same way `POST /markets` does, without needing the server running.
//
//   npx tsx scripts/recordMarket.ts
//
// Fill in the constants below to match the market you just created via
// contracts/scripts/interactions/createMarket.ts.

import { firebaseConfigured } from "../src/services/firebase.js";
import { firebaseService } from "../src/services/firebaseService.js";
import { MARKETS_COLLECTION, type StoredMarket } from "../src/api/routes/markets.js";

const market: StoredMarket = {
  marketId: "9",
  creator: "0x8eeFeDe7210f2Fe3F9d117D079511F64BCC0d698",
  txHash: "0xfe40a50889de5ff227726534f1c3e45f562dda3647a3319e12cb6f0b92fca6cb",
  question: "Will the Sepolia signer transfer at least 500 CTT before the deadline?",
  preset: "whale-transfer-demo",
  marketType: "SingleEvent",
  eventTemplate: "SingleWordValue",
  comparisonOperator: "GTE",
  chainKey: "1",
  sourceContract: "0xE8473Df91c4EB7cf0972E9dfb856329B84154920",
  eventSignature: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  watchedAddress: "0xC360f55BA7eb54c4DC9AE5b67D1dD5e8Fb95211b",
  threshold: "500000000000000000000",
  thresholdDisplay: "500 CTT",
  tokenSymbol: "CTT",
  tokenDecimals: 18,
  deadline: "1789284567",
  status: "Open",
  outcome: null,
  origin: "script",
};

async function main() {
  if (!firebaseConfigured) {
    throw new Error("CRED is not set — cannot write to Firestore");
  }

  const existing = await firebaseService.getDocument(MARKETS_COLLECTION, market.marketId);
  if (existing) {
    console.log(`marketId ${market.marketId} already exists in Firestore — not overwriting.`);
    return;
  }

  await firebaseService.createDocument(MARKETS_COLLECTION, market, market.marketId);
  console.log(`Stored marketId ${market.marketId} in Firestore collection "${MARKETS_COLLECTION}".`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
