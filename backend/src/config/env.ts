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

  // ── Resolution — fetches Attestcoin proofs and submits Markets.resolve(...) ──
  // Private key of the account that pays for and signs resolve() txs on the
  // MARKETS chain (Creditcoin). Unset ⇒ resolver stays idle (matcher still
  // flags conditionMet, nothing is submitted).
  RESOLVER_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 0x-prefixed 32-byte hex private key")
    .optional(),
  // Attestcoin Proof Builder service base URL (per Creditcoin testnet docs).
  PROOF_BUILDER_URL: z.string().url().default("https://prover.cc3-testnet.creditcoin.network"),
  // Attestcoin chainKey for the SOURCE chain, used when a market's stored
  // chainKey is missing (hydration from getMarket failed).
  SOURCE_CHAIN_KEY: z.coerce.number().int().nonnegative().default(0),
  // How the queue worker paces itself and how long it waits on attestation.
  RESOLUTION_QUEUE_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  RESOLUTION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  PROOF_ATTEST_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  PROOF_ATTEST_TIMEOUT_MS: z.coerce.number().int().positive().default(1_200_000),

  // ── Firebase ───────────────────────────────────────────────────────────────
  // Base64-encoded Firebase service account JSON. Unset ⇒ Firestore-backed
  // code paths throw when hit, but the backend still boots.
  CRED: z.string().min(1).optional(),
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

/** Resolver can only submit resolve() txs when it has a signing key and a deployed contract. */
export const resolverConfigured = marketsContractConfigured && Boolean(env.RESOLVER_PRIVATE_KEY);
