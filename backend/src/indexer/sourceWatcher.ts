// Watches the SOURCE chain (Ethereum Sepolia) for the real DeFi events that
// open markets are predicated on — ERC20 Transfer, Aave V3 Supply/Borrow,
// Uniswap V3 Swap. The set of contracts/events watched is derived live from
// the market registry the markets watcher maintains.

import { getAddress, parseEventLogs, type Address, type Hex } from "viem";
import { getLogs } from "viem/actions";
import { sourceClient } from "../chain/clients.js";
import { SOURCE_EVENTS_ABI, SOURCE_EVENT_BY_SIG } from "../chain/sourceEvents.js";
import { env } from "../config/env.js";
import { repositories } from "../db/repositories.js";
import { logger } from "../logger.js";
import { ingestSourceLog, type DecodedSourceLog } from "./matcher.js";
import { Poller } from "./poller.js";

const log = logger.child({ module: "watcher:source" });

/** Contracts currently worth polling — union of every watchable market's sourceContract. */
async function watchTargets(): Promise<Address[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const markets = await repositories.markets.listWatchable(nowSec);
  const addresses = new Set<string>();
  for (const m of markets) {
    if (!m.sourceContract) continue;
    try {
      addresses.add(getAddress(m.sourceContract));
    } catch {
      log.warn({ marketId: m.marketId, sourceContract: m.sourceContract }, "bad sourceContract, skipping");
    }
  }
  return [...addresses] as Address[];
}

function actorFromTopics(topics: readonly Hex[]): string | null {
  const t1 = topics[1];
  if (!t1) return null;
  try {
    return getAddress(`0x${t1.slice(-40)}`);
  } catch {
    return null;
  }
}

let poller: Poller | null = null;

export async function startSourceWatcher(): Promise<void> {
  poller = new Poller({
    key: "source",
    client: sourceClient,
    startSpec: env.SOURCE_START_BLOCK,
    async onRange(fromBlock, toBlock) {
      const addresses = await watchTargets();
      if (addresses.length === 0) return; // nothing to watch yet — cursor still advances

      const raw = await getLogs(sourceClient, { address: addresses, fromBlock, toBlock });
      if (raw.length === 0) return;

      const decoded = parseEventLogs({ abi: SOURCE_EVENTS_ABI, logs: raw, strict: false });
      log.info(
        { from: fromBlock.toString(), to: toBlock.toString(), raw: raw.length, decoded: decoded.length },
        "source logs",
      );

      let matchedCount = 0;
      for (const entry of decoded) {
        const sig = entry.topics[0]?.toLowerCase();
        if (!sig || !SOURCE_EVENT_BY_SIG[sig]) continue;

        const decodedLog: DecodedSourceLog = {
          eventName: entry.eventName,
          eventSignature: sig,
          address: entry.address,
          actor: actorFromTopics(entry.topics),
          args: entry.args as Record<string, unknown>,
          blockNumber: entry.blockNumber ?? 0n,
          blockHash: entry.blockHash ?? "",
          transactionHash: entry.transactionHash ?? "",
          logIndex: entry.logIndex ?? 0,
        };
        const matched = await ingestSourceLog(decodedLog);
        if (matched.length > 0) matchedCount += 1;
      }
      if (matchedCount > 0) log.info({ matchedCount }, "source events matched to markets");
    },
  });
  await poller.run();
}

export function stopSourceWatcher(): void {
  poller?.stop();
}
