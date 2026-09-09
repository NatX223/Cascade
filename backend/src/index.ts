import { createServer } from "./api/server.js";
import { env } from "./config/env.js";
import { startMarketsWatcher, stopMarketsWatcher } from "./indexer/marketsWatcher.js";
import { startSourceWatcher, stopSourceWatcher } from "./indexer/sourceWatcher.js";
import { logger } from "./logger.js";
import { startResolver, stopResolver } from "./resolution/queue.js";

async function main(): Promise<void> {
  const app = createServer();

  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}`);
  });

  // Both watchers run in this process for now. Split into separate services
  // later if throughput demands it.
  void startMarketsWatcher().catch((err) => logger.error({ err }, "markets watcher crashed"));
  void startSourceWatcher().catch((err) => logger.error({ err }, "source watcher crashed"));
  void startResolver().catch((err) => logger.error({ err }, "resolver crashed"));

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    stopMarketsWatcher();
    stopSourceWatcher();
    stopResolver();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
