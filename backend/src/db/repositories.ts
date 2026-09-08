// Storage layer, defined as interfaces so the in-memory implementation below
// can be swapped for a real database (Postgres/SQLite + an ORM) without
// touching the indexer or API. That swap is a follow-up — for now everything
// lives in process memory and is lost on restart.

import type {
  ContractEventRecord,
  IndexerCursor,
  MarketProgress,
  MarketRecord,
  SourceEventRecord,
} from "../types.js";

export interface MarketRepository {
  upsert(market: MarketRecord): Promise<void>;
  patch(marketId: string, patch: Partial<MarketRecord>): Promise<void>;
  get(marketId: string): Promise<MarketRecord | null>;
  list(opts?: { status?: MarketRecord["status"]; limit?: number; offset?: number }): Promise<MarketRecord[]>;
  /** Markets that are Open and whose deadline has not passed (as of `nowSec`). */
  listWatchable(nowSec: number): Promise<MarketRecord[]>;
}

export interface EventRepository {
  /** Returns false if an event with this id already existed (idempotent ingest). */
  add(event: ContractEventRecord): Promise<boolean>;
  listByMarket(marketId: string): Promise<ContractEventRecord[]>;
}

export interface SourceEventRepository {
  add(event: SourceEventRecord): Promise<boolean>;
  listByMarket(marketId: string): Promise<SourceEventRecord[]>;
}

export interface MarketProgressRepository {
  get(marketId: string): Promise<MarketProgress | null>;
  upsert(progress: MarketProgress): Promise<void>;
}

export interface CursorRepository {
  get(key: string): Promise<IndexerCursor | null>;
  set(cursor: IndexerCursor): Promise<void>;
}

// ── In-memory implementations ───────────────────────────────────────────────

class InMemoryMarketRepository implements MarketRepository {
  private readonly markets = new Map<string, MarketRecord>();

  async upsert(market: MarketRecord): Promise<void> {
    this.markets.set(market.marketId, market);
  }

  async patch(marketId: string, patch: Partial<MarketRecord>): Promise<void> {
    const existing = this.markets.get(marketId);
    if (!existing) return;
    this.markets.set(marketId, { ...existing, ...patch, updatedAt: new Date().toISOString() });
  }

  async get(marketId: string): Promise<MarketRecord | null> {
    return this.markets.get(marketId) ?? null;
  }

  async list(
    opts: { status?: MarketRecord["status"]; limit?: number; offset?: number } = {},
  ): Promise<MarketRecord[]> {
    let rows = [...this.markets.values()];
    if (opts.status) rows = rows.filter((m) => m.status === opts.status);
    rows.sort((a, b) => Number(BigInt(b.marketId) - BigInt(a.marketId)));
    const offset = opts.offset ?? 0;
    return rows.slice(offset, offset + (opts.limit ?? 100));
  }

  async listWatchable(nowSec: number): Promise<MarketRecord[]> {
    return [...this.markets.values()].filter(
      (m) => m.status === "Open" && Number(m.deadline) > nowSec,
    );
  }
}

class InMemoryEventRepository implements EventRepository {
  private readonly events = new Map<string, ContractEventRecord>();

  async add(event: ContractEventRecord): Promise<boolean> {
    if (this.events.has(event.id)) return false;
    this.events.set(event.id, event);
    return true;
  }

  async listByMarket(marketId: string): Promise<ContractEventRecord[]> {
    return [...this.events.values()]
      .filter((e) => e.marketId === marketId)
      .sort(byBlockThenLogIndex);
  }
}

class InMemorySourceEventRepository implements SourceEventRepository {
  private readonly events = new Map<string, SourceEventRecord>();

  async add(event: SourceEventRecord): Promise<boolean> {
    if (this.events.has(event.id)) return false;
    this.events.set(event.id, event);
    return true;
  }

  async listByMarket(marketId: string): Promise<SourceEventRecord[]> {
    return [...this.events.values()]
      .filter((e) => e.matchedMarketIds.includes(marketId))
      .sort(byBlockThenLogIndex);
  }
}

class InMemoryMarketProgressRepository implements MarketProgressRepository {
  private readonly progress = new Map<string, MarketProgress>();

  async get(marketId: string): Promise<MarketProgress | null> {
    return this.progress.get(marketId) ?? null;
  }

  async upsert(progress: MarketProgress): Promise<void> {
    this.progress.set(progress.marketId, progress);
  }
}

class InMemoryCursorRepository implements CursorRepository {
  private readonly cursors = new Map<string, IndexerCursor>();

  async get(key: string): Promise<IndexerCursor | null> {
    return this.cursors.get(key) ?? null;
  }

  async set(cursor: IndexerCursor): Promise<void> {
    this.cursors.set(cursor.key, cursor);
  }
}

function byBlockThenLogIndex(
  a: { blockNumber: string; logIndex: number },
  b: { blockNumber: string; logIndex: number },
): number {
  const byBlock = Number(BigInt(a.blockNumber) - BigInt(b.blockNumber));
  return byBlock !== 0 ? byBlock : a.logIndex - b.logIndex;
}

// ── Wiring ─────────────────────────────────────────────────────────────────

export interface Repositories {
  markets: MarketRepository;
  events: EventRepository;
  sourceEvents: SourceEventRepository;
  progress: MarketProgressRepository;
  cursor: CursorRepository;
}

export const repositories: Repositories = {
  markets: new InMemoryMarketRepository(),
  events: new InMemoryEventRepository(),
  sourceEvents: new InMemorySourceEventRepository(),
  progress: new InMemoryMarketProgressRepository(),
  cursor: new InMemoryCursorRepository(),
};
