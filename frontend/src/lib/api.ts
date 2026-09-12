// Thin client for the Cascade backend (see backend/src/api). Only the calls the
// frontend actually makes live here; everything is plain fetch against
// NEXT_PUBLIC_API_BASE_URL (defaults to the local dev server).

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "https://cascade-1-sd9s.onrender.com").replace(/\/$/, "");

/** Mirrors `createMarketSchema` in backend/src/api/routes/markets.ts. */
export type CreateMarketRecord = {
  marketId: string;
  creator: string;
  txHash: string;
  question: string;
  preset: string;
  marketType: "SingleEvent" | "Cumulative";
  eventTemplate: "Occurrence" | "SingleWordValue" | "AddressPrefixedValue" | "EventCount";
  comparisonOperator: "GTE" | "LTE" | "EQ";
  chainKey: string;
  sourceContract: string;
  eventSignature: string;
  watchedAddress: string;
  threshold: string;
  thresholdDisplay?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  deadline: string;
};

/**
 * Persist a market that was just created on-chain. The transaction is already
 * mined by the time this is called — Firestore is a read-model cache, so
 * callers should treat a rejection here as non-fatal.
 */
export async function persistCreatedMarket(record: CreateMarketRecord): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/markets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(record),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `market persistence failed (${res.status})`);
  }
}

/** A market as returned by the backend (the Firestore document + its id). */
export type StoredMarket = CreateMarketRecord & {
  id?: string;
  status: "Open" | "Resolved" | "Cancelled";
  outcome: boolean | null;
  origin?: string;
  createdAt?: { _seconds: number; _nanoseconds: number } | string | null;
  updatedAt?: { _seconds: number; _nanoseconds: number } | string | null;
};

export async function fetchMarkets(): Promise<StoredMarket[]> {
  const res = await fetch(`${API_BASE_URL}/markets`, { cache: "no-store" });
  if (!res.ok) throw new Error(`failed to load markets (${res.status})`);
  const body = (await res.json()) as { markets?: StoredMarket[] };
  return body.markets ?? [];
}

export async function fetchMarket(marketId: string): Promise<StoredMarket | null> {
  const res = await fetch(`${API_BASE_URL}/markets/${marketId}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`failed to load market ${marketId} (${res.status})`);
  const body = (await res.json()) as { market?: StoredMarket | null };
  return body.market ?? null;
}
