// Watches Markets.sol on the MARKETS chain (Creditcoin testnet) to keep a
// registry of every market and its watch configuration. The source watcher
// then uses that registry to know what to look for on Sepolia.

import { getContractEvents } from "viem/actions";
import type { Log } from "viem";
import {
  ComparisonOperator,
  EventTemplate,
  MarketType,
  marketsAbi,
  type IndexedEventName,
} from "../chain/marketsAbi.js";
import { marketsClient, MARKETS_ADDRESS } from "../chain/clients.js";
import { env, marketsContractConfigured } from "../config/env.js";
import { repositories } from "../db/repositories.js";
import { logger } from "../logger.js";
import type { ContractEventRecord, MarketProgress, MarketRecord } from "../types.js";
import { Poller } from "./poller.js";

const log = logger.child({ module: "watcher:markets" });

type DecodedLog = Log<bigint, number, false> & {
  eventName: IndexedEventName;
  args: Record<string, unknown>;
};

const asString = (v: unknown): string =>
  typeof v === "bigint" ? v.toString() : v == null ? "" : String(v);

const enumLabel = (table: Record<number, string>, v: unknown): string =>
  table[Number(v)] ?? asString(v);

function jsonSafeArgs(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]),
  );
}

function toEventRecord(entry: DecodedLog): ContractEventRecord {
  return {
    id: `${entry.transactionHash}:${entry.logIndex}`,
    eventName: entry.eventName,
    marketId: asString(entry.args.marketId),
    blockNumber: (entry.blockNumber ?? 0n).toString(),
    blockHash: entry.blockHash ?? "",
    transactionHash: entry.transactionHash ?? "",
    logIndex: entry.logIndex ?? 0,
    args: jsonSafeArgs(entry.args),
    createdAt: new Date().toISOString(),
  };
}

/** Pulls comparisonOperator + chainKey (not in the event) from the contract. */
async function hydrateFromContract(
  marketId: string,
): Promise<Pick<MarketRecord, "comparisonOperator" | "chainKey"> | null> {
  try {
    const m = await marketsClient.readContract({
      address: MARKETS_ADDRESS,
      abi: marketsAbi,
      functionName: "getMarket",
      args: [BigInt(marketId)],
    });
    return {
      comparisonOperator: enumLabel(ComparisonOperator, m.comparisonOperator) as MarketRecord["comparisonOperator"],
      chainKey: m.chainKey.toString(),
    };
  } catch (err) {
    log.warn({ err, marketId }, "getMarket hydration failed — comparisonOperator/chainKey unknown");
    return null;
  }
}

async function onMarketCreated(entry: DecodedLog, event: ContractEventRecord): Promise<void> {
  const a = entry.args;
  const now = new Date().toISOString();
  const hydrated = await hydrateFromContract(event.marketId);

  const market: MarketRecord = {
    marketId: event.marketId,
    creator: asString(a.creator),
    marketType: enumLabel(MarketType, a.marketType) as MarketRecord["marketType"],
    eventTemplate: enumLabel(EventTemplate, a.eventTemplate) as MarketRecord["eventTemplate"],
    comparisonOperator: hydrated?.comparisonOperator ?? "GTE",
    chainKey: hydrated?.chainKey ?? "",
    sourceContract: asString(a.sourceContract).toLowerCase(),
    eventSignature: asString(a.eventSignature).toLowerCase(),
    watchedAddress: asString(a.watchedAddress).toLowerCase(),
    threshold: asString(a.threshold),
    deadline: asString(a.deadline),
    status: "Open",
    outcome: null,
    createdBlock: event.blockNumber,
    createdTxHash: event.transactionHash,
    createdAt: now,
    updatedAt: now,
  };
  await repositories.markets.upsert(market);

  const progress: MarketProgress = {
    marketId: market.marketId,
    accumulatedValue: "0",
    matchedEventCount: 0,
    conditionMet: false,
    conditionMetAt: null,
    conditionMetTxHash: null,
    lastMatchedBlock: null,
    updatedAt: now,
  };
  await repositories.progress.upsert(progress);

  log.info(
    { marketId: market.marketId, source: market.sourceContract, sig: market.eventSignature },
    "market registered",
  );
}

type Handler = (entry: DecodedLog, event: ContractEventRecord) => Promise<void>;

const handlers: Partial<Record<IndexedEventName, Handler>> = {
  MarketCreated: onMarketCreated,
  async MarketResolved(entry, event) {
    await repositories.markets.patch(event.marketId, {
      status: "Resolved",
      outcome: Boolean(entry.args.outcome),
    });
    log.info({ marketId: event.marketId, outcome: entry.args.outcome }, "market resolved");
  },
  async MarketCancelled(_entry, event) {
    await repositories.markets.patch(event.marketId, { status: "Cancelled" });
    log.info({ marketId: event.marketId }, "market cancelled");
  },
  // BetPlaced / Claimed / Refunded are stored raw but not yet projected.
};

async function handleLogs(logs: DecodedLog[]): Promise<void> {
  for (const entry of logs) {
    const event = toEventRecord(entry);
    if (!(await repositories.events.add(event))) continue;
    const handler = handlers[entry.eventName];
    if (!handler) continue;
    try {
      await handler(entry, event);
    } catch (err) {
      log.error({ err, event: event.eventName, marketId: event.marketId }, "handler failed");
    }
  }
}

let poller: Poller | null = null;

export async function startMarketsWatcher(): Promise<void> {
  if (!marketsContractConfigured) {
    log.warn(
      "MARKETS_CONTRACT_ADDRESS is unset (zero address) — markets watcher idle. Set it once Markets.sol is deployed.",
    );
    return;
  }
  poller = new Poller({
    key: "markets",
    client: marketsClient,
    startSpec: env.MARKETS_START_BLOCK,
    async onRange(fromBlock, toBlock) {
      const events = await getContractEvents(marketsClient, {
        address: MARKETS_ADDRESS,
        abi: marketsAbi,
        fromBlock,
        toBlock,
        strict: true,
      });
      if (events.length > 0) {
        log.info({ from: fromBlock.toString(), to: toBlock.toString(), count: events.length }, "logs");
        await handleLogs(events as unknown as DecodedLog[]);
      }
    },
  });
  await poller.run();
}

export function stopMarketsWatcher(): void {
  poller?.stop();
}
