// ethers-side clients for the resolution pipeline. The indexer uses viem, but
// `@gluwa/usc-sdk` is built on ethers v6 (its ProofBuilder / PrecompileChainInfoProvider
// / computeGasLimit all take ethers types), so proof generation + resolve()
// submission live in ethers land. Keep this the only place the two worlds meet.

import { Contract, FetchRequest, JsonRpcProvider, Network, Wallet } from "ethers";
import { env } from "../config/env.js";

// Public RPCs on both chains are flaky under the resolver's load — a single slow
// response used to surface as `request timeout (code=TIMEOUT)` and burn a whole
// resolution attempt. Give each request a generous timeout and pin the network
// (`staticNetwork`) so ethers stops re-probing `eth_chainId` before every call.
function rpc(url: string, chainId: number): JsonRpcProvider {
  const req = new FetchRequest(url);
  req.timeout = env.RPC_REQUEST_TIMEOUT_MS;
  return new JsonRpcProvider(req, chainId, {
    staticNetwork: Network.from(chainId),
    polling: true,
  });
}

/** MARKETS chain (Creditcoin) — where resolve() is submitted and proofs are verified. */
export const creditcoinProvider = rpc(env.MARKETS_RPC_URL, env.MARKETS_CHAIN_ID);

/** SOURCE chain (Sepolia) — read-only, used to look up a proved tx's block height. */
export const sourceProvider = rpc(env.SOURCE_RPC_URL, env.SOURCE_CHAIN_ID);

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
