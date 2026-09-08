// The real on-chain events that markets are predicated on. These live on the
// SOURCE chain (Sepolia), NOT on Creditcoin. Signatures here must match the
// `*_SIG` constants in contracts/contracts/Markets.sol exactly — verified with
// toEventSelector(). `indexed` flags matter: they decide which args come from
// topics vs data, which is what the EventTemplate decode shapes rely on.

import type { AbiEvent } from "viem";

export const ERC20_TRANSFER_SIG =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;
export const AAVE_SUPPLY_SIG =
  "0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61" as const;
export const AAVE_BORROW_SIG =
  "0xb3d084820fb1a9decffb176436bd02558d15fac9b0ddfed8c465bc7359d7dce0" as const;
export const UNISWAP_V3_SWAP_SIG =
  "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67" as const;

// Aave V3 Pool on Sepolia — the AAVE_V3_POOL constant in Markets.sol.
export const AAVE_V3_POOL_SEPOLIA = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951" as const;

export const ERC20_TransferEvent = {
  type: "event",
  name: "Transfer",
  inputs: [
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "value", type: "uint256" },
  ],
} as const satisfies AbiEvent;

export const AaveV3_SupplyEvent = {
  type: "event",
  name: "Supply",
  inputs: [
    { indexed: true, name: "reserve", type: "address" },
    { indexed: false, name: "user", type: "address" },
    { indexed: true, name: "onBehalfOf", type: "address" },
    { indexed: false, name: "amount", type: "uint256" },
    { indexed: true, name: "referralCode", type: "uint16" },
  ],
} as const satisfies AbiEvent;

export const AaveV3_BorrowEvent = {
  type: "event",
  name: "Borrow",
  inputs: [
    { indexed: true, name: "reserve", type: "address" },
    { indexed: false, name: "user", type: "address" },
    { indexed: true, name: "onBehalfOf", type: "address" },
    { indexed: false, name: "amount", type: "uint256" },
    { indexed: false, name: "interestRateMode", type: "uint8" },
    { indexed: false, name: "borrowRate", type: "uint256" },
    { indexed: true, name: "referralCode", type: "uint16" },
  ],
} as const satisfies AbiEvent;

export const UniswapV3_SwapEvent = {
  type: "event",
  name: "Swap",
  inputs: [
    { indexed: true, name: "sender", type: "address" },
    { indexed: true, name: "recipient", type: "address" },
    { indexed: false, name: "amount0", type: "int256" },
    { indexed: false, name: "amount1", type: "int256" },
    { indexed: false, name: "sqrtPriceX96", type: "uint160" },
    { indexed: false, name: "liquidity", type: "uint128" },
    { indexed: false, name: "tick", type: "int24" },
  ],
} as const satisfies AbiEvent;

export type SourceEventSig =
  | typeof ERC20_TRANSFER_SIG
  | typeof AAVE_SUPPLY_SIG
  | typeof AAVE_BORROW_SIG
  | typeof UNISWAP_V3_SWAP_SIG;

/** selector (topics[0]) -> the AbiEvent used to decode a matching log. */
export const SOURCE_EVENT_BY_SIG: Record<string, { name: string; abi: AbiEvent }> = {
  [ERC20_TRANSFER_SIG]: { name: "Transfer", abi: ERC20_TransferEvent },
  [AAVE_SUPPLY_SIG]: { name: "Supply", abi: AaveV3_SupplyEvent },
  [AAVE_BORROW_SIG]: { name: "Borrow", abi: AaveV3_BorrowEvent },
  [UNISWAP_V3_SWAP_SIG]: { name: "Swap", abi: UniswapV3_SwapEvent },
};

/** Full ABI of every source event — handy for viem's parseEventLogs. */
export const SOURCE_EVENTS_ABI = [
  ERC20_TransferEvent,
  AaveV3_SupplyEvent,
  AaveV3_BorrowEvent,
  UniswapV3_SwapEvent,
] as const;
