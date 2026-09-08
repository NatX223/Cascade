import "dotenv/config";
import { z } from "zod";
import { isAddress } from "viem";

const blockSpec = z
  .string()
  .default("latest")
  .refine((v) => v === "latest" || /^\d+$/.test(v), 'must be "latest" or a block number');

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  // Markets chain — Creditcoin testnet, where Markets.sol lives.
  MARKETS_CHAIN_ID: z.coerce.number().int().positive().default(102031),
  MARKETS_RPC_URL: z.string().url().default("https://rpc.cc3-testnet.creditcoin.network"),
  MARKETS_CONTRACT_ADDRESS: z
    .string()
    .refine(isAddress, "must be a 0x-prefixed address")
    .default("0x0000000000000000000000000000000000000000"),
  MARKETS_START_BLOCK: blockSpec,

  // Source chain — Ethereum Sepolia, where the watched DeFi events happen.
  SOURCE_CHAIN_ID: z.coerce.number().int().positive().default(11155111),
  SOURCE_RPC_URL: z.string().url().default("https://ethereum-sepolia-rpc.publicnode.com"),
  SOURCE_START_BLOCK: blockSpec,

  INDEXER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  INDEXER_CONFIRMATIONS: z.coerce.number().int().nonnegative().default(2),
  INDEXER_MAX_BLOCK_RANGE: z.coerce.number().int().positive().default(2000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;

export function parseBlockSpec(v: "latest" | string): "latest" | bigint {
  return v === "latest" ? "latest" : BigInt(v);
}

export const marketsContractConfigured =
  env.MARKETS_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";
