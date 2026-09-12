import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
// Separate signer for the Ethereum (Sepolia) source chain — keep it distinct from
// the Creditcoin deployer so the two chains' keys aren't entangled.
const SEPOLIA_PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY;
const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const BLOCKSCOUT_API_KEY = process.env.BLOCKSCOUT_API_KEY || "abc";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {},
    creditcoinTestnet: {
      url: "https://rpc.cc3-testnet.creditcoin.network",
      chainId: 102031,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: SEPOLIA_PRIVATE_KEY ? [SEPOLIA_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      'creditcoin-testnet': 'empty'
    },
    customChains: [
      {
        network: "creditcoin-testnet",
        chainId: 102031,
        urls: {
          apiURL: "https://creditcoin-testnet.blockscout.com/api",
          browserURL: "https://creditcoin-testnet.blockscout.com"
        }
      }
    ]
  },
  sourcify: {
    enabled: false,
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};

export default config;
