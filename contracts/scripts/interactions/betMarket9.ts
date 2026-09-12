import hre from "hardhat";
import { getMarkets, logContext, MarketStatus } from "./common";

/**
 * Two-address demo bet on market 9 (the "sepolia signer transfers >= 500 CTT"
 * whale-transfer market): the main deployer signer (the one already in
 * contracts/.env as PRIVATE_KEY) bets YES 100 CTC, and a freshly generated +
 * funded wallet bets NO 75 CTC, so the pools reflect two distinct bettors.
 *
 *   npx hardhat run scripts/interactions/betMarket9.ts --network creditcoinTestnet
 */

const MARKET_ID = 9n;
const YES_BETTOR_AMOUNT = "100";
const NO_BETTOR_AMOUNT = "75";
const FUND_MARGIN = hre.ethers.parseEther("1"); // covers the 75 CTC bet + gas

async function main() {
  const signer = await logContext("betMarket9");
  const markets = await getMarkets();
  const provider = hre.ethers.provider;

  const before = await markets.getMarket(MARKET_ID);
  if (Number(before.status) !== MarketStatus.Open) {
    throw new Error(`market ${MARKET_ID} is not Open (status=${before.status})`);
  }

  // ── bettor B: fresh wallet, funded from the main signer ──────────────────
  const bettorB = hre.ethers.Wallet.createRandom().connect(provider);
  const fundAmount = hre.ethers.parseEther(NO_BETTOR_AMOUNT) + FUND_MARGIN;

  console.log(`\nGenerated bettor B: ${bettorB.address}`);
  console.log(`Funding it with ${hre.ethers.formatEther(fundAmount)} CTC from ${signer.address}...`);
  const fundTx = await signer.sendTransaction({ to: bettorB.address, value: fundAmount });
  await fundTx.wait();
  console.log(`  funded (tx ${fundTx.hash})`);

  const fs = await import("node:fs");
  const path = await import("node:path");
  const outPath = path.join(__dirname, ".market9-bettor-b.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ address: bettorB.address, privateKey: bettorB.privateKey }, null, 2),
  );
  console.log(`Saved bettor B key to ${outPath} (gitignored)`);

  // ── bet 1: main signer (contracts/.env PRIVATE_KEY) — YES 100 CTC ────────
  console.log(`\n[signer ${signer.address}] betting ${YES_BETTOR_AMOUNT} CTC YES on market ${MARKET_ID}`);
  const yesAmount = hre.ethers.parseEther(YES_BETTOR_AMOUNT);
  await markets.bet.staticCall(MARKET_ID, true, { value: yesAmount });
  const yesTx = await markets.bet(MARKET_ID, true, { value: yesAmount });
  const yesReceipt = await yesTx.wait();
  console.log(`  tx ${yesTx.hash} mined in block ${yesReceipt?.blockNumber}`);

  // ── bet 2: bettor B — NO 75 CTC ───────────────────────────────────────────
  console.log(`\n[bettor B ${bettorB.address}] betting ${NO_BETTOR_AMOUNT} CTC NO on market ${MARKET_ID}`);
  const noAmount = hre.ethers.parseEther(NO_BETTOR_AMOUNT);
  const marketsAsB = markets.connect(bettorB);
  await marketsAsB.bet.staticCall(MARKET_ID, false, { value: noAmount });
  const noTx = await marketsAsB.bet(MARKET_ID, false, { value: noAmount });
  const noReceipt = await noTx.wait();
  console.log(`  tx ${noTx.hash} mined in block ${noReceipt?.blockNumber}`);

  // ── summary ────────────────────────────────────────────────────────────
  const after = await markets.getMarket(MARKET_ID);
  console.log(`\nmarket ${MARKET_ID} pools now: yesPool=${hre.ethers.formatEther(after.yesPool)} CTC  noPool=${hre.ethers.formatEther(after.noPool)} CTC`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
