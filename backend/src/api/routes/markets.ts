import { Router } from "express";
import { repositories } from "../../db/repositories.js";
import type { MarketRecord } from "../../types.js";

export const marketsRouter: Router = Router();

const STATUSES: MarketRecord["status"][] = ["Open", "Resolved", "Cancelled"];

// GET /markets?status=Open&limit=50&offset=0
marketsRouter.get("/", async (req, res) => {
  const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;
  if (statusParam && !STATUSES.includes(statusParam as MarketRecord["status"])) {
    return res.status(400).json({ error: `status must be one of ${STATUSES.join(", ")}` });
  }

  const limit = clampInt(req.query.limit, 100, 1, 500);
  const offset = clampInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);

  const markets = await repositories.markets.list({
    status: statusParam as MarketRecord["status"] | undefined,
    limit,
    offset,
  });
  res.json({ markets, count: markets.length });
});

// GET /markets/:id — market config, progress toward its condition, and both
// event streams (Markets.sol lifecycle + matched Sepolia source events).
marketsRouter.get("/:id", async (req, res) => {
  const id = req.params.id;
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: "id must be a non-negative integer" });

  const market = await repositories.markets.get(id);
  if (!market) return res.status(404).json({ error: "market not found" });

  const [progress, events, sourceEvents] = await Promise.all([
    repositories.progress.get(id),
    repositories.events.listByMarket(id),
    repositories.sourceEvents.listByMarket(id),
  ]);

  res.json({ market, progress, events, sourceEvents });
});

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
