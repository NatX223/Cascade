// Matches a decoded source-chain log against the markets that watch it, then
// advances each market's progress toward its condition. Mirrors the decode /
// accumulate / compare logic in Markets.sol `_resolveMarket` — but here it only
// *detects* that a market's condition is met. Actually resolving it (fetching
// the Attestcoin proof and calling `resolve()` on Markets.sol) is a follow-up.

import { getAddress } from "viem";
import { repositories } from "../db/repositories.js";
import { logger } from "../logger.js";
import { enqueueResolution } from "../resolution/queue.js";
import type { MarketProgress, MarketRecord, SourceEventRecord } from "../types.js";

const log = logger.child({ module: "indexer:matcher" });

const ZERO = "0x0000000000000000000000000000000000000000";

export interface DecodedSourceLog {
  eventName: string;
  eventSignature: string;
  address: string;
  /** topics[1] as an address, when the event has an indexed first arg. */
  actor: string | null;
  args: Record<string, unknown>;
  blockNumber: bigint;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
}

/** Extracts the uint256 a market's EventTemplate would decode from this log. */
function decodeValue(market: MarketRecord, entry: DecodedSourceLog): bigint {
  switch (market.eventTemplate) {
    case "Occurrence":
      return 0n; // no value — the match itself is the trigger
    case "EventCount":
      return 1n;
    case "SingleWordValue": {
      // ERC20 Transfer's `value`.
      const v = entry.args.value ?? entry.args.amount;
      return toBigInt(v);
    }
    case "AddressPrefixedValue": {
      // Aave Supply/Borrow's `amount` (the word after the leading address).
      return toBigInt(entry.args.amount);
    }
  }
}

function compare(value: bigint, threshold: bigint, op: MarketRecord["comparisonOperator"]): boolean {
  if (op === "GTE") return value >= threshold;
  if (op === "LTE") return value <= threshold;
  return value === threshold; // EQ
}

function toBigInt(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "string" && /^-?\d+$/.test(v)) return BigInt(v);
  return 0n;
}

function sameAddress(a: string, b: string): boolean {
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return a.toLowerCase() === b.toLowerCase();
  }
}

/** True if this market watches this exact (contract, event[, actor]). */
function marketMatchesLog(market: MarketRecord, entry: DecodedSourceLog): boolean {
  if (market.eventSignature.toLowerCase() !== entry.eventSignature.toLowerCase()) return false;
  if (!sameAddress(market.sourceContract, entry.address)) return false;
  // Actor filter — Markets.sol `_checkActorFilter`: topics[1] vs watchedAddress.
  if (market.watchedAddress && market.watchedAddress !== ZERO) {
    if (!entry.actor || !sameAddress(market.watchedAddress, entry.actor)) return false;
  }
  return true;
}

/**
 * Ingests one decoded source log: finds matching watchable markets, records the
 * raw event, and updates each market's progress. Returns the market ids matched.
 */
export async function ingestSourceLog(entry: DecodedSourceLog): Promise<string[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const watchable = await repositories.markets.listWatchable(nowSec);
  const matched = watchable.filter((m) => marketMatchesLog(m, entry));
  if (matched.length === 0) return [];

  const now = new Date().toISOString();
  const record: SourceEventRecord = {
    id: `${entry.transactionHash}:${entry.logIndex}`,
    eventName: entry.eventName,
    eventSignature: entry.eventSignature,
    address: entry.address.toLowerCase(),
    actor: entry.actor?.toLowerCase() ?? null,
    blockNumber: entry.blockNumber.toString(),
    blockHash: entry.blockHash,
    transactionHash: entry.transactionHash,
    logIndex: entry.logIndex,
    args: Object.fromEntries(
      Object.entries(entry.args).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]),
    ),
    matchedMarketIds: matched.map((m) => m.marketId),
    createdAt: now,
  };
  const isNew = await repositories.sourceEvents.add(record);
  if (!isNew) return record.matchedMarketIds;

  for (const market of matched) {
    await advanceProgress(market, entry, now);
  }
  return record.matchedMarketIds;
}

async function advanceProgress(
  market: MarketRecord,
  entry: DecodedSourceLog,
  now: string,
): Promise<void> {
  const current =
    (await repositories.progress.get(market.marketId)) ??
    ({
      marketId: market.marketId,
      accumulatedValue: "0",
      matchedEventCount: 0,
      conditionMet: false,
      conditionMetAt: null,
      conditionMetTxHash: null,
      lastMatchedBlock: null,
      updatedAt: now,
    } satisfies MarketProgress);

  if (current.conditionMet) return;

  const value = decodeValue(market, entry);
  const threshold = toBigInt(market.threshold);
  const matchedEventCount = current.matchedEventCount + 1;

  let accumulated = toBigInt(current.accumulatedValue);
  let conditionMet: boolean;

  if (market.eventTemplate === "Occurrence") {
    conditionMet = true;
  } else if (market.marketType === "Cumulative") {
    accumulated += value;
    conditionMet = compare(accumulated, threshold, market.comparisonOperator);
  } else {
    // SingleEvent — compare this event's value directly.
    conditionMet = compare(value, threshold, market.comparisonOperator);
  }

  const next: MarketProgress = {
    marketId: market.marketId,
    accumulatedValue: accumulated.toString(),
    matchedEventCount,
    conditionMet,
    conditionMetAt: conditionMet ? now : null,
    conditionMetTxHash: conditionMet ? entry.transactionHash : null,
    lastMatchedBlock: entry.blockNumber.toString(),
    updatedAt: now,
  };
  await repositories.progress.upsert(next);

  log.info(
    {
      marketId: market.marketId,
      event: entry.eventName,
      value: value.toString(),
      accumulated: next.accumulatedValue,
      conditionMet,
    },
    conditionMet ? "market condition MET — ready to resolve" : "market progress updated",
  );

  // Hand this tx off to the resolution worker, which fetches its Attestcoin
  // proof and submits Markets.resolve(...). For a Cumulative market every
  // contributing tx must be proven on-chain to move the on-chain accumulator, so
  // enqueue each match; for SingleEvent/Occurrence only the triggering tx
  // matters. Fire-and-forget — it only writes the in-memory job store and must
  // not slow the poll.
  if (conditionMet || market.marketType === "Cumulative") {
    void enqueueResolution(market.marketId, entry.transactionHash, market.chainKey).catch((err) =>
      log.error({ err, marketId: market.marketId }, "failed to enqueue resolution"),
    );
  }
}
