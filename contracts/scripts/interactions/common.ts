import hre from "hardhat";
import type { Markets } from "../../typechain-types";

/// Address of the live Markets deployment on Creditcoin testnet.
/// Override with the MARKETS_ADDRESS env var to point at a different deployment.
export const MARKETS_ADDRESS =
  process.env.MARKETS_ADDRESS ?? "0x0a0d9f5875b54d9adfa4Fc121D9C5f70EEE2450f";

// Enum values, mirroring contracts/Markets.sol. Order matters.
export const MarketType = { SingleEvent: 0, Cumulative: 1 } as const;
export const EventTemplate = {
  Occurrence: 0,
  SingleWordValue: 1,
  AddressPrefixedValue: 2,
  EventCount: 3,
} as const;
export const ComparisonOperator = { GTE: 0, LTE: 1, EQ: 2 } as const;
export const MarketStatus = { Open: 0, Resolved: 1, Cancelled: 2 } as const;

/// The ERC20 `Transfer(address,address,uint256)` topic — a convenient, always-valid
/// event signature for smoke-testing market creation.
export const ERC20_TRANSFER_SIG =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export async function getMarkets(): Promise<Markets> {
  const markets = (await hre.ethers.getContractAt(
    "Markets",
    MARKETS_ADDRESS,
  )) as unknown as Markets;
  return markets;
}

export async function logContext(label: string) {
  const [signer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(signer.address);
  console.log(`\n=== ${label} ===`);
  console.log(`network:  ${hre.network.name}`);
  console.log(`contract: ${MARKETS_ADDRESS}`);
  console.log(`signer:   ${signer.address}`);
  console.log(`balance:  ${hre.ethers.formatEther(balance)}\n`);
  return signer;
}
