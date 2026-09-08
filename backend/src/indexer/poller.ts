import type { PublicClient } from "viem";
import { env, parseBlockSpec } from "../config/env.js";
import { repositories } from "../db/repositories.js";
import { logger } from "../logger.js";

export interface PollerOptions {
  /** Cursor key + log-namespace, e.g. "markets" or "source". */
  key: string;
  client: PublicClient;
  /** Where to begin on a fresh start (no saved cursor). */
  startSpec: "latest" | string;
  /** Process a [fromBlock, toBlock] window. Throw to retry the whole tick. */
  onRange: (fromBlock: bigint, toBlock: bigint) => Promise<void>;
}

/**
 * Generic confirmations-aware block poller. Tracks its position in the cursor
 * repo, chunks large gaps into `INDEXER_MAX_BLOCK_RANGE` windows, and retries
 * the tick on failure without advancing.
 */
export class Poller {
  private stopRequested = false;
  private readonly log;

  constructor(private readonly opts: PollerOptions) {
    this.log = logger.child({ module: `poller:${opts.key}` });
  }

  stop(): void {
    this.stopRequested = true;
  }

  async run(): Promise<void> {
    let cursor = await this.resolveStart();
    this.log.info({ startBlock: cursor.toString() }, "poller started");

    while (!this.stopRequested) {
      try {
        cursor = await this.tick(cursor);
      } catch (err) {
        this.log.error({ err }, "tick failed — retrying after poll interval");
      }
      await sleep(env.INDEXER_POLL_INTERVAL_MS);
    }
    this.log.info("poller stopped");
  }

  private async resolveStart(): Promise<bigint> {
    const saved = await repositories.cursor.get(this.opts.key);
    if (saved) return BigInt(saved.lastProcessedBlock);
    const spec = parseBlockSpec(this.opts.startSpec);
    return spec === "latest" ? this.opts.client.getBlockNumber() : spec;
  }

  private async tick(cursor: bigint): Promise<bigint> {
    const head = await this.opts.client.getBlockNumber();
    const safeHead = head - BigInt(env.INDEXER_CONFIRMATIONS);
    if (safeHead <= cursor) return cursor;

    const span = BigInt(env.INDEXER_MAX_BLOCK_RANGE);
    let from = cursor + 1n;
    while (from <= safeHead && !this.stopRequested) {
      const to = from + span - 1n > safeHead ? safeHead : from + span - 1n;
      await this.opts.onRange(from, to);
      await repositories.cursor.set({ key: this.opts.key, lastProcessedBlock: to.toString() });
      from = to + 1n;
    }
    return from - 1n;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
