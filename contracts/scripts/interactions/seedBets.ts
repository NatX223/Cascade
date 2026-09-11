import hre from "hardhat";
import { getMarkets, logContext, MarketStatus } from "./common";

/**
 * Demo seeding: generates a handful of fresh wallets, funds each from the
 * main deployer signer, then places a spread of YES/NO bets across markets
 * 2-8 from those wallets so the pools look like real multi-party activity
 * instead of everything coming from one address.
 *
 *   npx hardhat run scripts/interactions/seedBets.ts --network creditcoinTestnet
 *
 * Generated wallets (address + private key) are printed and also written to
 * scripts/interactions/.seed-wallets.json (gitignored) in case they're
 * needed again later (e.g. as a whale-transfer demo actor).
 */

const FUND_AMOUNT = hre.ethers.parseEther("0.02"); // per wallet, covers all its bets + gas with margin

type Bet = { marketId: number; outcome: boolean; amount: string; wallet: number };

// 5 wallets (0-4), spread across markets 2-8, both outcomes represented on
// every market, amounts varied so pools don't look uniform.
const BETS: Bet[] = [
  { marketId: 2, outcome: true, amount: "0.004", wallet: 0 },
  { marketId: 2, outcome: false, amount: "0.0015", wallet: 1 },
  { marketId: 3, outcome: true, amount: "0.0022", wallet: 1 },
  { marketId: 3, outcome: false, amount: "0.001", wallet: 2 },
  { marketId: 4, outcome: true, amount: "0.0035", wallet: 2 },
  { marketId: 4, outcome: false, amount: "0.0012", wallet: 3 },
  { marketId: 5, outcome: true, amount: "0.0025", wallet: 3 },
  { marketId: 5, outcome: false, amount: "0.0008", wallet: 4 },
  { marketId: 6, outcome: true, amount: "0.005", wallet: 4 },
  { marketId: 6, outcome: false, amount: "0.0018", wallet: 0 },
  { marketId: 7, outcome: true, amount: "0.0022", wallet: 0 },
  { marketId: 7, outcome: false, amount: "0.0013", wallet: 1 },
  { marketId: 8, outcome: true, amount: "0.003", wallet: 2 },
  { marketId: 8, outcome: false, amount: "0.0011", wallet: 3 },
];

const WALLET_COUNT = 5;

async function main() {
  const signer = await logContext("seedBets");
  const markets = await getMarkets();
  const provider = hre.ethers.provider;

  // ── 1. Generate wallets ────────────────────────────────────────────────
  const wallets = Array.from({ length: WALLET_COUNT }, () => hre.ethers.Wallet.createRandom().connect(provider));
  console.log("Generated wallets:");
  wallets.forEach((w, i) => console.log(`  [${i}] ${w.address}`));

  const fs = await import("node:fs");
  const path = await import("node:path");
  const outPath = path.join(__dirname, ".seed-wallets.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      wallets.map((w, i) => ({ index: i, address: w.address, privateKey: w.privateKey })),
      null,
      2,
    ),
  );
  console.log(`Saved wallet keys to ${outPath} (gitignored)`);

  // ── 2. Fund each wallet from the deployer signer ───────────────────────
  console.log(`\nFunding each wallet with ${hre.ethers.formatEther(FUND_AMOUNT)} CTC...`);
  for (const w of wallets) {
    const tx = await signer.sendTransaction({ to: w.address, value: FUND_AMOUNT });
    await tx.wait();
    const bal = await provider.getBalance(w.address);
    console.log(`  funded ${w.address}: balance ${hre.ethers.formatEther(bal)} CTC (tx ${tx.hash})`);
  }

  // ── 3. Place bets ───────────────────────────────────────────────────────
  console.log(`\nPlacing ${BETS.length} bets...`);
  for (const b of BETS) {
    const wallet = wallets[b.wallet];
    const marketId = BigInt(b.marketId);
    const amount = hre.ethers.parseEther(b.amount);
    const marketsAsWallet = markets.connect(wallet);

    const before = await markets.getMarket(marketId);
    if (Number(before.status) !== MarketStatus.Open) {
      console.warn(`  SKIP market ${b.marketId}: not Open (status=${before.status})`);
      continue;
    }

    console.log(`\n  wallet[${b.wallet}] betting ${b.amount} CTC ${b.outcome ? "YES" : "NO"} on market ${b.marketId}`);
    try {
      await marketsAsWallet.bet.staticCall(marketId, b.outcome, { value: amount });
      const tx = await marketsAsWallet.bet(marketId, b.outcome, { value: amount });
      const receipt = await tx.wait();
      console.log(`    tx ${tx.hash} mined in block ${receipt?.blockNumber}`);
    } catch (err) {
      console.error(`    FAILED:`, err instanceof Error ? err.message : err);
    }
  }

  // ── 4. Summary ───────────────────────────────────────────────────────────
  console.log("\n──────────── final pool state ────────────");
  const marketIds = [...new Set(BETS.map((b) => b.marketId))].sort((a, b) => a - b);
  for (const id of marketIds) {
    const m = await markets.getMarket(BigInt(id));
    console.log(
      `market ${id}: yesPool=${hre.ethers.formatEther(m.yesPool)} CTC  noPool=${hre.ethers.formatEther(m.noPool)} CTC`,
    );
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
