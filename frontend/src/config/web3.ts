import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";
import { sepolia } from "viem/chains";

export { sepolia };

export const creditcoinTestnet = defineChain({
  id: 102031,
  name: "creditcoin-testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.cc3-testnet.creditcoin.network"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://creditcoin-testnet.blockscout.com",
    },
  },
  testnet: true,
});

export const config = getDefaultConfig({
  appName: "Cascade",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "cascade-dev",
  chains: [creditcoinTestnet, sepolia],
  ssr: true,
});
