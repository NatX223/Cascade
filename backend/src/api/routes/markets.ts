import { Router } from "express";
import { z } from "zod";
import { repositories } from "../../db/repositories.js";
import { firebaseConfigured } from "../../services/firebase.js";
import { firebaseService } from "../../services/firebaseService.js";
import type { MarketRecord } from "../../types.js";

export const marketsRouter: Router = Router();

const STATUSES: MarketRecord["status"][] = ["Open", "Resolved", "Cancelled"];

/** Firestore collection holding markets created from the frontend. */
export const MARKETS_COLLECTION = "markets";

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "must be a 20-byte hex address");
const bytes32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/, "must be a 32-byte hex value");
const uintString = z.string().regex(/^\d+$/, "must be a non-negative integer string");

// The frontend already has everything the contract event carries plus the
// human-readable question and the preset it was built from — the indexer never
// sees those, so we persist the frontend's view here rather than reconstructing
// it from chain logs.
const createMarketSchema = z.object({
  marketId: uintString,
  creator: address,
  txHash: bytes32,
  question: z.string().trim().min(1).max(500),
  preset: z.string().trim().min(1).max(64),
  marketType: z.enum(["SingleEvent", "Cumulative"]),
  eventTemplate: z.enum(["Occurrence", "SingleWordValue", "AddressPrefixedValue", "EventCount"]),
  comparisonOperator: z.enum(["GTE", "LTE", "EQ"]),
  chainKey: uintString,
  sourceContract: address,
  eventSignature: bytes32,
  watchedAddress: address,
  threshold: uintString,
  thresholdDisplay: z.string().trim().min(1).max(80).optional(),
  tokenSymbol: z.string().trim().min(1).max(40).optional(),
  tokenDecimals: z.number().int().min(0).max(255).optional(),
  deadline: uintString,
});

export type CreateMarketInput = z.infer<typeof createMarketSchema>;

/** A market as stored in Firestore by `POST /markets`. */
export type StoredMarket = CreateMarketInput & {
  id?: string;
  status: "Open" | "Resolved" | "Cancelled";
  outcome: boolean | null;
  origin?: string;
};

/** marketId descending — newest market first. */
function byMarketIdDesc(a: { marketId: string }, b: { marketId: string }): number {
  return Number(BigInt(b.marketId) - BigInt(a.marketId));
}

// GET /markets?status=Open&limit=50&offset=0
// Frontend-created markets live in Firestore; the in-memory indexer registry is
// the fallback (and all there is when CRED is unset).
marketsRouter.get("/", async (req, res) => {
  const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;
  if (statusParam && !STATUSES.includes(statusParam as MarketRecord["status"])) {
    return res.status(400).json({ error: `status must be one of ${STATUSES.join(", ")}` });
  }

  const limit = clampInt(req.query.limit, 100, 1, 500);
  const offset = clampInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);

  if (firebaseConfigured) {
    try {
      let rows = await firebaseService.getAllDocuments<StoredMarket>(MARKETS_COLLECTION);
      if (statusParam) rows = rows.filter((m) => m.status === statusParam);
      rows.sort(byMarketIdDesc);
      const page = rows.slice(offset, offset + limit);
      return res.json({ markets: page, count: page.length, source: "firestore" });
    } catch (err) {
      req.log.error({ err }, "firestore market list failed — falling back to in-memory");
    }
  }

  const markets = await repositories.markets.list({
    status: statusParam as MarketRecord["status"] | undefined,
    limit,
    offset,
  });
  res.json({ markets, count: markets.length, source: "memory" });
});

// POST /markets — persist a market the frontend just created on-chain.
// The transaction is already mined by the time this is called; Firestore is a
// read-model cache, so a failure here doesn't invalidate the market.
marketsRouter.post("/", async (req, res) => {
  if (!firebaseConfigured) {
    return res.status(503).json({ error: "market persistence is not configured (CRED unset)" });
  }

  const parsed = createMarketSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "invalid market payload", details: parsed.error.flatten().fieldErrors });
  }

  const input = parsed.data;

  try {
    const existing = await firebaseService.getDocument(MARKETS_COLLECTION, input.marketId);
    if (existing) {
      return res.status(200).json({ marketId: input.marketId, stored: false, reason: "already exists" });
    }

    await firebaseService.createDocument(
      MARKETS_COLLECTION,
      { ...input, status: "Open" as const, outcome: null, origin: "frontend" as const },
      input.marketId,
    );
    return res.status(201).json({ marketId: input.marketId, stored: true });
  } catch (err) {
    req.log.error({ err, marketId: input.marketId }, "failed to persist created market");
    return res.status(500).json({ error: "failed to persist market" });
  }
});

// GET /markets/:id — market config, progress toward its condition, and both
// event streams (Markets.sol lifecycle + matched Sepolia source events).
marketsRouter.get("/:id", async (req, res) => {
  const id = req.params.id;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: "id must be a non-negative integer" });

  if (firebaseConfigured) {
    try {
      const stored = await firebaseService.getDocument<StoredMarket>(MARKETS_COLLECTION, id);
      if (stored) {
        return res.json({
          market: stored,
          progress: null,
          events: [],
          sourceEvents: [],
          resolutions: [],
          source: "firestore",
        });
      }
    } catch (err) {
      req.log.error({ err, id }, "firestore market read failed — falling back to in-memory");
    }
  }

  const market = await repositories.markets.get(id);
  if (!market) return res.status(404).json({ error: "market not found" });

  const [progress, events, sourceEvents, resolutions] = await Promise.all([
    repositories.progress.get(id),
    repositories.events.listByMarket(id),
    repositories.sourceEvents.listByMarket(id),
    repositories.resolutions.listByMarket(id),
  ]);

  res.json({ market, progress, events, sourceEvents, resolutions });
});

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
