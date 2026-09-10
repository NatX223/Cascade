// Combines a stored market (backend/Firestore — the human question, preset and
// watch config) with its live on-chain state from Markets.getMarket (pools,
// status, accumulated value) into one view model the list and detail pages render.

import { formatEther, formatUnits, type Address } from "viem";
import type { StoredMarket } from "@/lib/api";
import { EVENT_SIGNATURE_NAME } from "@/lib/contracts/markets";

export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/** The `Markets.Market` struct as wagmi decodes it from `getMarket`. */
export type OnChainMarket = {
  marketType: number;
  chainKey: bigint;
  status: number; // 0 Open · 1 Resolved · 2 Cancelled
  outcome: boolean;
  eventTemplate: number;
  sourceContract: Address;
  watchedAddress: Address;
  comparisonOperator: number; // 0 GTE · 1 LTE · 2 EQ
  eventSignature: `0x${string}`;
  threshold: bigint;
  accumulatedValue: bigint;
  yesPool: bigint;
  noPool: bigint;
  creator: Address;
  deadline: bigint;
};

export type MarketStatusKey = "open" | "resolved" | "cancelled";

export type MarketView = {
  id: number;
  marketId: string;
  question: string;
  creator: string;
  txHash: string;
  preset: string;

  isCumulative: boolean;
  typeLabel: string;
  eventName: string;
  eventSignature: string;
  sourceContract: string;
  watchedAddress: string | null;
  comparisonWord: string;
  thresholdLabel: string;

  deadlineSec: number;
  deadlineDate: Date;
  deadlineLabel: string;
  deadlinePassed: boolean;
  timeLeftLabel: string;

  statusKey: MarketStatusKey;
  statusLabel: string;
  statusColor: string;
  outcome: "yes" | "no" | null;

  hasChain: boolean;
  yesPool: bigint;
  noPool: bigint;
  poolCtc: number;
  poolLabel: string;
  yesPct: number;

  accumulatedValue: bigint | null;
  progressPct: number;
  progressLabel: string;
};

const STATUS_COLOR: Record<MarketStatusKey, string> = {
  open: "#3DDC97",
  resolved: "#A5A3BE",
  cancelled: "#FF5C7A",
};

const COMPARISON_WORD: Record<number, string> = { 0: "at least", 1: "at most", 2: "exactly" };

function ratioPct(part: bigint, whole: bigint): number {
  if (whole <= BigInt(0)) return 0;
  return Math.round(Number((part * BigInt(10_000)) / whole) / 100);
}

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "ended";
  const mins = Math.floor(ms / 60_000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins % 60}m left`;
  return `${mins}m left`;
}

export function toMarketView(
  stored: StoredMarket,
  chain?: OnChainMarket | null,
  nowMs: number = Date.now(),
): MarketView {
  const isCumulative = stored.marketType === "Cumulative";

  // Threshold: prefer the human value the creator entered; fall back to the raw
  // integer scaled by the token's decimals when we know them.
  const thresholdLabel =
    stored.thresholdDisplay?.trim() ||
    (stored.tokenDecimals !== undefined
      ? formatUnits(BigInt(stored.threshold), stored.tokenDecimals)
      : stored.threshold);
  const thresholdWithSymbol = stored.tokenSymbol
    ? `${thresholdLabel} ${stored.tokenSymbol}`
    : String(thresholdLabel);

  const deadlineSec = Number(stored.deadline);
  const deadlineDate = new Date(deadlineSec * 1000);
  const deadlinePassed = deadlineDate.getTime() <= nowMs;

  // Status: chain wins when we have it (it knows Resolved/Cancelled); otherwise
  // trust what the backend stored at creation.
  let statusKey: MarketStatusKey;
  if (chain) {
    statusKey = chain.status === 1 ? "resolved" : chain.status === 2 ? "cancelled" : "open";
  } else {
    statusKey =
      stored.status === "Resolved" ? "resolved" : stored.status === "Cancelled" ? "cancelled" : "open";
  }

  const outcomeBool = chain ? (chain.status === 1 ? chain.outcome : null) : stored.outcome;
  const outcome = outcomeBool === true ? "yes" : outcomeBool === false ? "no" : null;

  const statusLabel =
    statusKey === "open"
      ? deadlinePassed
        ? "Awaiting resolution"
        : "Open"
      : statusKey === "cancelled"
        ? "Cancelled"
        : outcome === "yes"
          ? "Resolved yes"
          : "Resolved no";

  const yesPool = chain?.yesPool ?? BigInt(0);
  const noPool = chain?.noPool ?? BigInt(0);
  const totalPool = yesPool + noPool;
  const poolCtc = chain ? Number(formatEther(totalPool)) : 0;
  const yesPct = chain && totalPool > BigInt(0) ? ratioPct(yesPool, totalPool) : 50;

  const accumulatedValue = chain?.accumulatedValue ?? null;
  let progressPct = 0;
  let progressLabel = "";
  if (chain && isCumulative) {
    progressPct = statusKey === "resolved" ? 100 : ratioPct(chain.accumulatedValue, chain.threshold);
    const acc =
      stored.tokenDecimals !== undefined
        ? formatUnits(chain.accumulatedValue, stored.tokenDecimals)
        : chain.accumulatedValue.toString();
    progressLabel = `${acc} / ${thresholdWithSymbol}`;
  } else {
    progressPct = statusKey === "resolved" ? 100 : statusKey === "open" ? 15 : 0;
    progressLabel = statusKey === "resolved" ? "Matching event verified" : "Waiting for a matching event";
  }

  const watched =
    stored.watchedAddress && stored.watchedAddress.toLowerCase() !== ZERO_ADDRESS
      ? stored.watchedAddress
      : null;

  return {
    id: Number(stored.marketId),
    marketId: stored.marketId,
    question: stored.question,
    creator: stored.creator,
    txHash: stored.txHash,
    preset: stored.preset,

    isCumulative,
    typeLabel: isCumulative ? "Cumulative" : "One-off",
    eventName: EVENT_SIGNATURE_NAME[stored.eventSignature.toLowerCase()] ?? "Custom event",
    eventSignature: stored.eventSignature,
    sourceContract: stored.sourceContract,
    watchedAddress: watched,
    comparisonWord: COMPARISON_WORD[
      stored.comparisonOperator === "LTE" ? 1 : stored.comparisonOperator === "EQ" ? 2 : 0
    ]!,
    thresholdLabel: thresholdWithSymbol,

    deadlineSec,
    deadlineDate,
    deadlineLabel: deadlineDate.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    deadlinePassed,
    timeLeftLabel: formatTimeLeft(deadlineDate.getTime() - nowMs),

    statusKey,
    statusLabel,
    statusColor: STATUS_COLOR[statusKey],
    outcome,

    hasChain: Boolean(chain),
    yesPool,
    noPool,
    poolCtc,
    poolLabel: poolCtc.toFixed(poolCtc >= 100 ? 0 : poolCtc >= 1 ? 2 : 4),
    yesPct,

    accumulatedValue,
    progressPct,
    progressLabel,
  };
}

/** Short 0x1234…abcd form. */
export function shortAddress(addr: string): string {
  return addr && addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}
