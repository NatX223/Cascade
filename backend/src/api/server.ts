import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { pinoHttp } from "pino-http";
import { marketsContractConfigured } from "../config/env.js";
import { repositories } from "../db/repositories.js";
import { logger } from "../logger.js";
import { marketsRouter } from "./routes/markets.js";

export function createServer(): Express {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(cors());
  app.use(express.json());

  app.get("/health", async (_req, res) => {
    const [markets, source] = await Promise.all([
      repositories.cursor.get("markets"),
      repositories.cursor.get("source"),
    ]);
    res.json({
      status: "ok",
      contractConfigured: marketsContractConfigured,
      indexer: {
        marketsChainBlock: markets?.lastProcessedBlock ?? null,
        sourceChainBlock: source?.lastProcessedBlock ?? null,
      },
    });
  });

  app.use("/markets", marketsRouter);

  app.use((_req, res) => res.status(404).json({ error: "not found" }));

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    req.log.error({ err }, "unhandled request error");
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}
