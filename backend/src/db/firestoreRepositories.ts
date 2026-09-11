// Firestore-backed implementations of the repository interfaces in
// repositories.ts, used in place of the in-memory ones once CRED is set (see
// the wiring at the bottom of that file). Records are stored as plain
// objects — the interfaces already define createdAt/updatedAt etc. as ISO
// strings, so nothing here reaches for Firestore's Timestamp type.

import { getDb } from "../services/firebase.js";
import type {
  ContractEventRecord,
  IndexerCursor,
  MarketProgress,
  MarketRecord,
  ResolutionJobRecord,
  SourceEventRecord,
} from "../types.js";
import type {
  CursorRepository,
  EventRepository,
  MarketProgressRepository,
  MarketRepository,
  ResolutionRepository,
  SourceEventRepository,
} from "./repositories.js";

export const INDEXER_MARKETS_COLLECTION = "indexerMarkets";
export const CONTRACT_EVENTS_COLLECTION = "contractEvents";
export const SOURCE_EVENTS_COLLECTION = "sourceEvents";
export const MARKET_PROGRESS_COLLECTION = "marketProgress";
export const RESOLUTION_JOBS_COLLECTION = "resolutionJobs";
export const INDEXER_CURSORS_COLLECTION = "indexerCursors";

function byBlockThenLogIndex(
  a: { blockNumber: string; logIndex: number },
  b: { blockNumber: string; logIndex: number },
): number {
  const byBlock = Number(BigInt(a.blockNumber) - BigInt(b.blockNumber));
  return byBlock !== 0 ? byBlock : a.logIndex - b.logIndex;
}

export class FirestoreMarketRepository implements MarketRepository {
  private collection() {
    return getDb().collection(INDEXER_MARKETS_COLLECTION);
  }

  async upsert(market: MarketRecord): Promise<void> {
    await this.collection().doc(market.marketId).set(market);
  }

  async patch(marketId: string, patch: Partial<MarketRecord>): Promise<void> {
    const ref = this.collection().doc(marketId);
    const snap = await ref.get();
    if (!snap.exists) return;
    await ref.set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
  }

  async get(marketId: string): Promise<MarketRecord | null> {
    const snap = await this.collection().doc(marketId).get();
    return snap.exists ? (snap.data() as MarketRecord) : null;
  }

  async list(
    opts: { status?: MarketRecord["status"]; limit?: number; offset?: number } = {},
  ): Promise<MarketRecord[]> {
    const snap = await this.collection().get();
    let rows = snap.docs.map((d) => d.data() as MarketRecord);
    if (opts.status) rows = rows.filter((m) => m.status === opts.status);
    rows.sort((a, b) => Number(BigInt(b.marketId) - BigInt(a.marketId)));
    const offset = opts.offset ?? 0;
    return rows.slice(offset, offset + (opts.limit ?? 100));
  }

  async listWatchable(nowSec: number): Promise<MarketRecord[]> {
    const snap = await this.collection().get();
    return snap.docs
      .map((d) => d.data() as MarketRecord)
      .filter((m) => m.status === "Open" && Number(m.deadline) > nowSec);
  }
}

export class FirestoreEventRepository implements EventRepository {
  private collection() {
    return getDb().collection(CONTRACT_EVENTS_COLLECTION);
  }

  async add(event: ContractEventRecord): Promise<boolean> {
    const ref = this.collection().doc(event.id);
    if ((await ref.get()).exists) return false;
    await ref.set(event);
    return true;
  }

  async listByMarket(marketId: string): Promise<ContractEventRecord[]> {
    const snap = await this.collection().where("marketId", "==", marketId).get();
    return snap.docs.map((d) => d.data() as ContractEventRecord).sort(byBlockThenLogIndex);
  }
}

export class FirestoreSourceEventRepository implements SourceEventRepository {
  private collection() {
    return getDb().collection(SOURCE_EVENTS_COLLECTION);
  }

  async add(event: SourceEventRecord): Promise<boolean> {
    const ref = this.collection().doc(event.id);
    if ((await ref.get()).exists) return false;
    await ref.set(event);
    return true;
  }

  async listByMarket(marketId: string): Promise<SourceEventRecord[]> {
    const snap = await this.collection().where("matchedMarketIds", "array-contains", marketId).get();
    return snap.docs.map((d) => d.data() as SourceEventRecord).sort(byBlockThenLogIndex);
  }
}

export class FirestoreMarketProgressRepository implements MarketProgressRepository {
  private collection() {
    return getDb().collection(MARKET_PROGRESS_COLLECTION);
  }

  async get(marketId: string): Promise<MarketProgress | null> {
    const snap = await this.collection().doc(marketId).get();
    return snap.exists ? (snap.data() as MarketProgress) : null;
  }

  async upsert(progress: MarketProgress): Promise<void> {
    await this.collection().doc(progress.marketId).set(progress);
  }
}

const RESOLUTION_TERMINAL_STATUSES = new Set<ResolutionJobRecord["status"]>([
  "submitted",
  "resolved",
  "failed",
]);

function resolutionJobDocId(marketId: string, transactionHash: string): string {
  return `${marketId}:${transactionHash.toLowerCase()}`;
}

export class FirestoreResolutionRepository implements ResolutionRepository {
  private collection() {
    return getDb().collection(RESOLUTION_JOBS_COLLECTION);
  }

  async get(marketId: string, transactionHash: string): Promise<ResolutionJobRecord | null> {
    const snap = await this.collection().doc(resolutionJobDocId(marketId, transactionHash)).get();
    return snap.exists ? (snap.data() as ResolutionJobRecord) : null;
  }

  async upsert(job: ResolutionJobRecord): Promise<void> {
    await this.collection().doc(resolutionJobDocId(job.marketId, job.transactionHash)).set(job);
  }

  async patch(
    marketId: string,
    transactionHash: string,
    patch: Partial<ResolutionJobRecord>,
  ): Promise<void> {
    const ref = this.collection().doc(resolutionJobDocId(marketId, transactionHash));
    const snap = await ref.get();
    if (!snap.exists) return;
    await ref.set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
  }

  async listByMarket(marketId: string): Promise<ResolutionJobRecord[]> {
    const snap = await this.collection().where("marketId", "==", marketId).get();
    return snap.docs
      .map((d) => d.data() as ResolutionJobRecord)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listPending(): Promise<ResolutionJobRecord[]> {
    const snap = await this.collection().get();
    return snap.docs
      .map((d) => d.data() as ResolutionJobRecord)
      .filter((j) => !RESOLUTION_TERMINAL_STATUSES.has(j.status));
  }
}

export class FirestoreCursorRepository implements CursorRepository {
  private collection() {
    return getDb().collection(INDEXER_CURSORS_COLLECTION);
  }

  async get(key: string): Promise<IndexerCursor | null> {
    const snap = await this.collection().doc(key).get();
    return snap.exists ? (snap.data() as IndexerCursor) : null;
  }

  async set(cursor: IndexerCursor): Promise<void> {
    await this.collection().doc(cursor.key).set(cursor);
  }
}
