"use client";

// Data hooks for the markets pages: the human-readable record comes from the
// backend (Firestore) via react-query; live pools / status / progress come from
// Markets.getMarket on Creditcoin via wagmi. `toMarketView` merges the two.

import { useQuery } from "@tanstack/react-query";
import { useReadContract, useReadContracts } from "wagmi";
import { fetchMarket, fetchMarkets, type StoredMarket } from "@/lib/api";
import { MARKETS_CONTRACT_ADDRESS, marketsAbi } from "@/lib/contracts/markets";
import { toMarketView, ZERO_ADDRESS, type MarketView, type OnChainMarket } from "@/lib/market-view";

const contractReady = MARKETS_CONTRACT_ADDRESS.toLowerCase() !== ZERO_ADDRESS;

function safeId(marketId: string): bigint {
  return /^\d+$/.test(marketId) ? BigInt(marketId) : BigInt(0);
}

export function useMarketsList() {
  const stored = useQuery({ queryKey: ["markets"], queryFn: fetchMarkets, staleTime: 15_000 });
  const rows: StoredMarket[] = stored.data ?? [];

  const chain = useReadContracts({
    allowFailure: true,
    contracts: rows.map((m) => ({
      address: MARKETS_CONTRACT_ADDRESS,
      abi: marketsAbi,
      functionName: "getMarket",
      args: [safeId(m.marketId)],
    })),
    query: { enabled: contractReady && rows.length > 0, refetchInterval: 20_000 },
  });

  // A malformed Firestore doc (partial write, stray manual test record) should
  // drop out of the list, not take the whole page down with it.
  const markets: MarketView[] = rows.flatMap((m, i) => {
    const entry = chain.data?.[i];
    const onChain =
      entry && entry.status === "success" ? (entry.result as unknown as OnChainMarket) : null;
    try {
      return [toMarketView(m, onChain)];
    } catch (err) {
      console.error("skipping malformed market record", m.marketId, err);
      return [];
    }
  });

  return {
    markets,
    isLoading: stored.isLoading,
    isError: stored.isError,
    error: stored.error as Error | null,
    refetch: stored.refetch,
  };
}

export function useMarket(marketId: string) {
  const stored = useQuery({
    queryKey: ["market", marketId],
    queryFn: () => fetchMarket(marketId),
    staleTime: 15_000,
    enabled: /^\d+$/.test(marketId),
  });

  const chain = useReadContract({
    address: MARKETS_CONTRACT_ADDRESS,
    abi: marketsAbi,
    functionName: "getMarket",
    args: [safeId(marketId)],
    query: { enabled: contractReady && /^\d+$/.test(marketId), refetchInterval: 15_000 },
  });

  const onChain = (chain.data as unknown as OnChainMarket | undefined) ?? null;
  let view: MarketView | null = null;
  if (stored.data) {
    try {
      view = toMarketView(stored.data, onChain);
    } catch (err) {
      console.error("malformed market record", marketId, err);
    }
  }

  return {
    view,
    stored: stored.data ?? null,
    isLoading: stored.isLoading,
    notFound: stored.isSuccess && stored.data === null,
    error: stored.error as Error | null,
    refetchChain: () => {
      void chain.refetch();
      void stored.refetch();
    },
  };
}
