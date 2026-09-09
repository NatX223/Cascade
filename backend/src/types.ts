import type { IndexedEventName } from "./chain/marketsAbi.js";

// ─────────────────────────────────────────────────────────────────────────────
// Markets chain (Creditcoin) — Markets.sol lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/** A Markets.sol log the indexer has seen, stored for replay/debugging. */
export interface ContractEventRecord {
  /** `${transactionHash}:${logIndex}` — unique per log, used for dedupe. */
  id: string;
  eventName: IndexedEventName;
  marketId: string;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  args: Record<string, unknown>;
  createdAt: string;
}

/** Projection of a market + its watch configuration, built from its event stream. */
export interface MarketRecord {
  marketId: string;
  creator: string;
  marketType: "SingleEvent" | "Cumulative";
  eventTemplate: "Occurrence" | "SingleWordValue" | "AddressPrefixedValue" | "EventCount";
  comparisonOperator: "GTE" | "LTE" | "EQ";
  /** Attestcoin chainKey the source condition lives on (from getMarket). */
  chainKey: string;
  /** Source-chain contract whose events resolve this market (on SOURCE chain). */
  sourceContract: string;
  /** topics[0] of the event being watched. */
  eventSignature: string;
  /** Optional actor filter — checked against the matched log's topics[1]. Zero = no filter. */
  watchedAddress: string;
  threshold: string;
  deadline: string;
  status: "Open" | "Resolved" | "Cancelled";
  outcome: boolean | null;
  createdBlock: string;
  createdTxHash: string;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source chain (Sepolia) — the watched DeFi events
// ─────────────────────────────────────────────────────────────────────────────

/** A raw source-chain log the watcher matched to at least one market. */
export interface SourceEventRecord {
  id: string; // `${transactionHash}:${logIndex}`
  eventName: string; // Transfer | Supply | Borrow | Swap
  eventSignature: string;
  address: string; // emitting contract
  actor: string | null; // topics[1] as address, when present
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  args: Record<string, unknown>;
  matchedMarketIds: string[];
  createdAt: string;
}

/** Running progress of a market toward its condition, updated from source events. */
export interface MarketProgress {
  marketId: string;
  accumulatedValue: string;
  matchedEventCount: number;
  conditionMet: boolean;
  conditionMetAt: string | null;
  /** Source-chain tx that pushed the market over its threshold. */
  conditionMetTxHash: string | null;
  lastMatchedBlock: string | null;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution — Attestcoin proof + Markets.resolve(...) submission
// ─────────────────────────────────────────────────────────────────────────────

export type ResolutionStatus =
  | "queued" // waiting for the worker to pick it up
  | "proving" // waiting on attestation / fetching the proof
  | "submitting" // resolve() tx sent, awaiting receipt
  | "submitted" // resolve() mined; MarketResolved not seen in the receipt
  | "resolved" // resolve() mined and emitted MarketResolved
  | "failed"; // gave up after RESOLUTION_MAX_ATTEMPTS

/** One market's progress toward having its condition verified on-chain. */
export interface ResolutionJobRecord {
  marketId: string;
  /** Source-chain tx that met the condition — the thing we prove. */
  transactionHash: string;
  /** Attestcoin chainKey the source tx lives on. */
  chainKey: string;
  status: ResolutionStatus;
  attempts: number;
  lastError: string | null;
  /** MARKETS-chain tx hash of the resolve() call, once submitted. */
  resolveTxHash: string | null;
  /** Outcome parsed from the MarketResolved event, once mined. */
  outcome: boolean | null;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Indexer bookkeeping
// ─────────────────────────────────────────────────────────────────────────────

/** Persisted indexer position per watcher, so restarts resume. */
export interface IndexerCursor {
  key: string; // "markets" | "source"
  lastProcessedBlock: string;
}
