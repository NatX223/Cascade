import { createPublicClient, defineChain, http, type PublicClient } from "viem";
import { sepolia } from "viem/chains";
import { env } from "../config/env.js";

// Markets chain — mirrors frontend/src/config/web3.ts.
export const creditcoinTestnet = defineChain({
  id: 102031,
  name: "creditcoin-testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.cc3-testnet.creditcoin.network"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://creditcoin-testnet.blockscout.com" },
  },
  testnet: true,
});

function resolveChain(chainId: number, fallback: typeof creditcoinTestnet | typeof sepolia) {
  if (chainId === fallback.id) return fallback;
  return defineChain({ ...fallback, id: chainId, name: `chain-${chainId}` });
}

/** Creditcoin testnet — reads Markets.sol lifecycle events. */
export const marketsClient: PublicClient = createPublicClient({
  chain: resolveChain(env.MARKETS_CHAIN_ID, creditcoinTestnet),
  transport: http(env.MARKETS_RPC_URL),
});

/** Ethereum Sepolia — reads the DeFi source events markets are predicated on. */
export const sourceClient: PublicClient = createPublicClient({
  chain: resolveChain(env.SOURCE_CHAIN_ID, sepolia),
  transport: http(env.SOURCE_RPC_URL),
});

export const MARKETS_ADDRESS = env.MARKETS_CONTRACT_ADDRESS;
