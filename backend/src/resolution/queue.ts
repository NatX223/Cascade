// Decoupled resolution worker. The matcher detects that a market's condition is
// (or is progressing toward being) met and calls `enqueueResolution` per source
// tx; everything after that — waiting on attestation, fetching the Attestcoin
// proof, submitting Markets.resolve(...) — happens here, off the polling path,
// because a single proof can take ~8–20 minutes.
//
// One job per (marketId, transactionHash): a Cumulative market needs every
// contributing tx proven on-chain to cross its threshold, and one source tx may
// resolve several markets. The job store (repositories.resolutions) is the
// source of truth, so a restart resumes cleanly.

import { proofProvider, utils } from "@gluwa/usc-sdk";
import type { TransactionReceipt } from "ethers";
import {
  creditcoinProvider,
  marketsResolveContract,
  resolverWallet,
  sourceProvider,
} from "../chain/resolverClients.js";
import { env, resolverConfigured } from "../config/env.js";
import { repositories } from "../db/repositories.js";
import { logger } from "../logger.js";
import type { ResolutionJobRecord } from "../types.js";
import { generateProofFor } from "./proof.js";

const log = logger.child({ module: "resolution:queue" });

/**
 * In-flight / cached proof requests, keyed `${chainKey}:${txHash}`. A single
 * source tx can resolve several markets — the proof only depends on (chainKey,
 * blockHeight, txIndex), not the market — so it's generated once and every
 * resolve() call that needs it awaits the same promise.
 */
const proofInFlight = new Map<string, Promise<proofProvider.ProofResult>>();

/**
 * Market ids with a job currently being processed. Kept at market granularity
 * (not per-tx) so a Cumulative market's proofs submit one at a time — avoids
 * wallet nonce races and keeps on-chain accumulation ordered.
 */
const processing = new Set<string>();

let timer: NodeJS.Timeout | null = null;

function chainKeyFor(job: ResolutionJobRecord): number {
  const parsed = Number(job.chainKey);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : env.SOURCE_CHAIN_KEY;
}

function getOrGenerateProof(chainKey: number, txHash: string): Promise<proofProvider.ProofResult> {
  const key = `${chainKey}:${txHash.toLowerCase()}`;
  let pending = proofInFlight.get(key);
  if (!pending) {
    pending = generateProofFor(
      txHash,
      chainKey,
      env.PROOF_BUILDER_URL,
      creditcoinProvider,
      sourceProvider,
    ).then(
      (result) => {
        // Keep successes cached (cheap reuse); drop failures so a retry re-requests.
        if (!result.success) proofInFlight.delete(key);
        return result;
      },
      (err) => {
        // A rejection (not a {success:false}) must clear the cache too, otherwise
        // every later tick awaits the same already-rejected promise and fails
        // instantly without ever retrying the proof.
        proofInFlight.delete(key);
        throw err;
      },
    );
    proofInFlight.set(key, pending);
  }
  return pending;
}

/**
 * Registers a resolution job for one (market, source tx) pair. Idempotent — a
 * pair already tracked in any non-`failed` state is left alone. Re-enqueuing a
 * `failed` job (matcher re-fires, or a restart's rebuild) gives it a clean
 * attempt count. Safe to call from the hot path: it only touches the in-memory store.
 */
export async function enqueueResolution(
  marketId: string,
  transactionHash: string,
  chainKey: string,
): Promise<void> {
  const existing = await repositories.resolutions.get(marketId, transactionHash);
  if (existing && existing.status !== "failed") return;

  const now = new Date().toISOString();
  await repositories.resolutions.upsert({
    marketId,
    transactionHash,
    chainKey,
    status: "queued",
    attempts: 0,
    lastError: null,
    resolveTxHash: null,
    outcome: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  log.info({ marketId, transactionHash }, "resolution job queued");
}

async function tick(): Promise<void> {
  for (const job of await repositories.resolutions.listPending()) {
    if (job.status !== "queued") continue;
    if (processing.has(job.marketId)) continue;
    processing.add(job.marketId);
    void processJob(job)
      .catch((err) =>
        log.error({ err, marketId: job.marketId, tx: job.transactionHash }, "resolution job crashed"),
      )
      .finally(() => processing.delete(job.marketId));
  }
}

async function processJob(job: ResolutionJobRecord): Promise<void> {
  const patch = (p: Partial<ResolutionJobRecord>) =>
    repositories.resolutions.patch(job.marketId, job.transactionHash, p);

  // A market can close out from under us (resolved by another proof, expiry,
  // cancellation). A duplicate resolve() would just revert, so stop early.
  const market = await repositories.markets.get(job.marketId);
  if (market && market.status !== "Open") {
    await patch({ status: "resolved", outcome: market.outcome });
    log.info({ marketId: job.marketId, status: market.status }, "market already closed — job done");
    return;
  }

  await patch({ status: "proving" });
  const proof = await getOrGenerateProof(chainKeyFor(job), job.transactionHash);
  if (!proof.success || !proof.data) {
    await handleFailure(job, proof.error ?? "proof generation failed");
    return;
  }

  await patch({ status: "submitting" });
  try {
    const { resolveTxHash, outcome, sawEvent } = await submitResolveAndAwait(
      job.marketId,
      proof.data,
    );
    await patch({
      status: sawEvent ? "resolved" : "submitted",
      resolveTxHash,
      outcome,
      lastError: null,
    });
    log.info(
      { marketId: job.marketId, tx: job.transactionHash, resolveTxHash, outcome, sawEvent },
      sawEvent ? "market resolved" : "resolve() mined (market still open — accumulating)",
    );
  } catch (err) {
    await handleFailure(job, err instanceof Error ? err.message : String(err));
  }
}

async function handleFailure(job: ResolutionJobRecord, error: string): Promise<void> {
  const attempts = job.attempts + 1;
  const giveUp = attempts >= env.RESOLUTION_MAX_ATTEMPTS;
  await repositories.resolutions.patch(job.marketId, job.transactionHash, {
    status: giveUp ? "failed" : "queued",
    attempts,
    lastError: error,
  });
  log.warn(
    { marketId: job.marketId, tx: job.transactionHash, attempts, max: env.RESOLUTION_MAX_ATTEMPTS, error },
    giveUp ? "resolution gave up" : "resolution failed — will retry",
  );
}

interface SubmitResult {
  resolveTxHash: string;
  outcome: boolean | null;
  sawEvent: boolean;
}

/**
 * Encodes and submits Markets.resolve(...) for one market, using an already
 * generated proof. Mirrors the reference `computeGasLimitForMinter` /
 * `submitProofToMinterAndAwait`: the estimateGas-may-fail-against-the-precompile
 * fallback is handled inside the SDK's `computeGasLimit`, and the receipt is
 * scanned for MarketResolved via `interface.parseLog`, not a separate filter
 * (avoids the "filter id does not exist" RPC issue noted in the reference code).
 */
async function submitResolveAndAwait(
  marketId: string,
  data: proofProvider.ContinuityResponse,
): Promise<SubmitResult> {
  const contract = marketsResolveContract();
  if (!contract || !resolverWallet) throw new Error("resolver not configured");

  const merkleProof = {
    root: data.merkleProof.root,
    siblings: data.merkleProof.siblings.map((s) => ({ hash: s.hash, isLeft: s.isLeft })),
  };
  const continuityProof = {
    lowerEndpointDigest: data.continuityProof.lowerEndpointDigest,
    roots: data.continuityProof.roots,
  };
  const args = [
    BigInt(marketId),
    BigInt(data.chainKey),
    BigInt(data.headerNumber),
    data.txBytes,
    merkleProof,
    continuityProof,
  ] as const;

  const encoded = contract.interface.encodeFunctionData("resolve", args);
  // `as never` casts: ethers v6 ships CJS+ESM builds whose class types are
  // nominally distinct (private brand); the SDK's .d.ts sees the other build.
  // Same runtime objects — cast only at the SDK boundary.
  const gasLimit = await utils.gas.computeGasLimit(
    creditcoinProvider as never,
    contract as never,
    encoded,
    resolverWallet.address,
    continuityProof.roots.length,
  );

  const tx = await contract.getFunction("resolve")(...args, { gasLimit });
  log.info({ marketId, resolveTxHash: tx.hash }, "resolve() tx sent — awaiting receipt");
  const receipt: TransactionReceipt = await tx.wait();

  let outcome: boolean | null = null;
  let sawEvent = false;
  for (const rlog of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog({ topics: [...rlog.topics], data: rlog.data });
      if (parsed?.name === "MarketResolved" && parsed.args.marketId === BigInt(marketId)) {
        outcome = Boolean(parsed.args.outcome);
        sawEvent = true;
        break;
      }
    } catch {
      // not one of our events — skip
    }
  }

  return { resolveTxHash: receipt.hash, outcome, sawEvent };
}

/** Re-queue jobs / matched txs left dangling by a restart (the store is in-memory). */
async function rebuildFromState(): Promise<void> {
  for (const job of await repositories.resolutions.listPending()) {
    if (job.status !== "queued") {
      // Reset the attempt counter too — a restart is a fresh chance, and a job
      // parked in `failed` would otherwise give up again on its first hiccup.
      await repositories.resolutions.patch(job.marketId, job.transactionHash, {
        status: "queued",
        attempts: 0,
        lastError: null,
      });
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);
  for (const market of await repositories.markets.list({ status: "Open" })) {
    if (Number(market.deadline) <= nowSec) continue;
    const progress = await repositories.progress.get(market.marketId);

    if (market.marketType === "Cumulative") {
      // Every matched tx contributes to the on-chain accumulator — prove them all.
      for (const ev of await repositories.sourceEvents.listByMarket(market.marketId)) {
        await enqueueResolution(market.marketId, ev.transactionHash, market.chainKey);
      }
    } else if (progress?.conditionMet && progress.conditionMetTxHash) {
      await enqueueResolution(market.marketId, progress.conditionMetTxHash, market.chainKey);
    }
  }
}

export async function startResolver(): Promise<void> {
  if (!resolverConfigured) {
    log.warn(
      "resolver idle — set RESOLVER_PRIVATE_KEY and MARKETS_CONTRACT_ADDRESS to submit resolve() calls",
    );
    return;
  }
  await rebuildFromState();
  log.info(
    { queueIntervalMs: env.RESOLUTION_QUEUE_INTERVAL_MS, proofBuilder: env.PROOF_BUILDER_URL },
    "resolver started",
  );
  timer = setInterval(() => {
    void tick().catch((err) => log.error({ err }, "resolution tick failed"));
  }, env.RESOLUTION_QUEUE_INTERVAL_MS);
}

export function stopResolver(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
