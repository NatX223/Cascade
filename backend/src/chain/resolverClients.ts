// ethers-side clients for the resolution pipeline. The indexer uses viem, but
// `@gluwa/usc-sdk` is built on ethers v6 (its ProofBuilder / PrecompileChainInfoProvider
// / computeGasLimit all take ethers types), so proof generation + resolve()
// submission live in ethers land. Keep this the only place the two worlds meet.

import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { env } from "../config/env.js";

/** MARKETS chain (Creditcoin) — where resolve() is submitted and proofs are verified. */
export const creditcoinProvider = new JsonRpcProvider(env.MARKETS_RPC_URL, env.MARKETS_CHAIN_ID);

/** SOURCE chain (Sepolia) — read-only, used to look up a proved tx's block height. */
export const sourceProvider = new JsonRpcProvider(env.SOURCE_RPC_URL, env.SOURCE_CHAIN_ID);

/** Signs and pays for resolve() txs. Null when RESOLVER_PRIVATE_KEY is unset. */
export const resolverWallet: Wallet | null = env.RESOLVER_PRIVATE_KEY
  ? new Wallet(env.RESOLVER_PRIVATE_KEY, creditcoinProvider)
  : null;

// Minimal ABI: the resolve() entrypoint from MarketBase.sol plus the events we
// parse out of its receipt. Struct tuples match INativeQueryVerifier's
// MerkleProof / ContinuityProof exactly.
export const RESOLVE_ABI = [
  {
    type: "function",
    name: "resolve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "chainKey", type: "uint64" },
      { name: "blockHeight", type: "uint64" },
      { name: "encodedTransaction", type: "bytes" },
      {
        name: "merkleProof",
        type: "tuple",
        components: [
          { name: "root", type: "bytes32" },
          {
            name: "siblings",
            type: "tuple[]",
            components: [
              { name: "hash", type: "bytes32" },
              { name: "isLeft", type: "bool" },
            ],
          },
        ],
      },
      {
        name: "continuityProof",
        type: "tuple",
        components: [
          { name: "lowerEndpointDigest", type: "bytes32" },
          { name: "roots", type: "bytes32[]" },
        ],
      },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
  {
    type: "event",
    name: "MarketResolved",
    inputs: [
      { indexed: true, name: "marketId", type: "uint256" },
      { indexed: false, name: "outcome", type: "bool" },
    ],
  },
] as const;

/** Markets contract bound to the resolver wallet. Null when the resolver is unconfigured. */
export function marketsResolveContract(): Contract | null {
  if (!resolverWallet) return null;
  return new Contract(env.MARKETS_CONTRACT_ADDRESS, RESOLVE_ABI, resolverWallet);
}
