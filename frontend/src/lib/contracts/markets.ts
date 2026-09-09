// Markets contract bindings — kept in sync by hand with
// contracts/contracts/Markets.sol. See market-creation-brief.md for the
// user-facing preset mapping this file's constants/enums back.
//
// Two values below are placeholders that MUST be confirmed before this ever
// goes to a real deployment — see the loud comments next to them:
//   - MARKETS_CONTRACT_ADDRESS (no deployment exists yet)
//   - SEPOLIA_CHAIN_KEY (Attestcoin's chainKey id for Sepolia isn't recorded
//     anywhere in this repo or the @gluwa/asc-contracts package)
import type { Address } from "viem";

/// Deployed address of Markets.sol on Creditcoin testnet (chain 102031, see
/// src/config/web3.ts). Defaults to the current testnet deployment; override
/// with NEXT_PUBLIC_MARKETS_CONTRACT_ADDRESS for a different one.
export const MARKETS_CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_MARKETS_CONTRACT_ADDRESS ||
  "0x0a0d9f5875b54d9adfa4Fc121D9C5f70EEE2450f") as Address;

/// Every market card in the UI still renders from mock data (src/lib/cascade-data.ts),
/// so on-chain bets are all pointed at this one real market for now. Swap for the
/// route's real id once the list/detail pages read from the contract.
export const DEFAULT_MARKET_ID = BigInt(0);

/// Attestcoin's chainKey identifier for Ethereum Sepolia, passed as
/// `createMarket`'s `chainKey` param. UNCONFIRMED — defaulted to Sepolia's
/// standard EVM chain id (11155111) as the most plausible placeholder, but
/// this is exactly the kind of value that fails silently: a wrong chainKey
/// doesn't reject at creation time, it just makes the market's proofs never
/// verify. Confirm the real value against Attestcoin's chain registry (or
/// NEXT_PUBLIC_SEPOLIA_CHAIN_KEY) before relying on this in production.
export const SEPOLIA_CHAIN_KEY = BigInt(process.env.NEXT_PUBLIC_SEPOLIA_CHAIN_KEY || "11155111");

// ─────────────────────────────────────────────────────────────────────────
// Known constants — copied verbatim from Markets.sol. Never let the user
// type these; a wrong signature/address makes a market permanently
// unresolvable with no on-chain way to warn them after the fact.
// ─────────────────────────────────────────────────────────────────────────

export const AAVE_V3_POOL: Address = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";
export const AAVE_SUPPLY_SIG = "0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61" as const;
export const AAVE_BORROW_SIG = "0xb3d084820fb1a9decffb176436bd02558d15fac9b0ddfed8c465bc7359d7dce0" as const;
export const UNISWAP_V3_SWAP_SIG = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67" as const;
export const ERC20_TRANSFER_SIG = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

// ─────────────────────────────────────────────────────────────────────────
// Enums — ordinal values must match the Solidity enum declaration order in
// Markets.sol exactly, since they're passed as raw uint8 through the ABI.
// ─────────────────────────────────────────────────────────────────────────

export const MarketType = {
  SingleEvent: 0,
  Cumulative: 1,
} as const;

export const EventTemplate = {
  Occurrence: 0,
  SingleWordValue: 1,
  AddressPrefixedValue: 2,
  EventCount: 3,
} as const;

export const ComparisonOperator = {
  GTE: 0,
  LTE: 1,
  EQ: 2,
} as const;

export const MarketStatus = {
  Open: 0,
  Resolved: 1,
  Cancelled: 2,
} as const;

// ─────────────────────────────────────────────────────────────────────────
// ABI
// ─────────────────────────────────────────────────────────────────────────

export const marketsAbi = [
  { inputs: [], stateMutability: "nonpayable", type: "constructor" },
  { inputs: [], name: "AlreadyClaimed", type: "error" },
  { inputs: [], name: "AlreadyRefunded", type: "error" },
  { inputs: [], name: "DeadlineInPast", type: "error" },
  { inputs: [], name: "DeadlineNotReached", type: "error" },
  { inputs: [], name: "InvalidThreshold", type: "error" },
  { inputs: [], name: "MarketDoesNotExist", type: "error" },
  { inputs: [], name: "MarketDoesNotExistOrClosed", type: "error" },
  { inputs: [], name: "MarketExpired", type: "error" },
  { inputs: [], name: "MarketNotCancelled", type: "error" },
  { inputs: [], name: "MarketNotOpen", type: "error" },
  { inputs: [], name: "MarketNotResolved", type: "error" },
  { inputs: [], name: "MarketPastDeadline", type: "error" },
  { inputs: [], name: "MissingActorTopic", type: "error" },
  { inputs: [], name: "NoMatchingEvent", type: "error" },
  { inputs: [], name: "NoWinningStake", type: "error" },
  { inputs: [], name: "NotOwner", type: "error" },
  { inputs: [], name: "PayoutTransferFailed", type: "error" },
  { inputs: [], name: "ReentrancyGuardReentrantCall", type: "error" },
  { inputs: [], name: "SourceTransactionNotSuccessful", type: "error" },
  { inputs: [], name: "UnexpectedDataLength", type: "error" },
  { inputs: [], name: "UnsupportedEventTemplate", type: "error" },
  { inputs: [], name: "ZeroAddress", type: "error" },
  { inputs: [], name: "ZeroAmount", type: "error" },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "marketId", type: "uint256" },
      { indexed: true, internalType: "address", name: "bettor", type: "address" },
      { indexed: false, internalType: "bool", name: "outcome", type: "bool" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "BetPlaced",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "marketId", type: "uint256" },
      { indexed: true, internalType: "address", name: "bettor", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "Claimed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "MarketCancelled",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "marketId", type: "uint256" },
      { indexed: true, internalType: "address", name: "creator", type: "address" },
      { indexed: false, internalType: "enum Markets.MarketType", name: "marketType", type: "uint8" },
      { indexed: false, internalType: "enum Markets.EventTemplate", name: "eventTemplate", type: "uint8" },
      { indexed: false, internalType: "address", name: "sourceContract", type: "address" },
      { indexed: false, internalType: "bytes32", name: "eventSignature", type: "bytes32" },
      { indexed: false, internalType: "address", name: "watchedAddress", type: "address" },
      { indexed: false, internalType: "uint256", name: "threshold", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "MarketCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "marketId", type: "uint256" },
      { indexed: false, internalType: "bool", name: "outcome", type: "bool" },
    ],
    name: "MarketResolved",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "marketId", type: "uint256" },
      { indexed: true, internalType: "address", name: "bettor", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "Refunded",
    type: "event",
  },
  { inputs: [], name: "AAVE_BORROW_SIG", outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "AAVE_SUPPLY_SIG", outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "AAVE_V3_POOL", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "ERC20_TRANSFER_SIG", outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "UNISWAP_V3_SWAP_SIG", outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "VERIFIER", outputs: [{ internalType: "contract INativeQueryVerifier", name: "", type: "address" }], stateMutability: "view", type: "function" },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "bool", name: "outcome", type: "bool" },
    ],
    name: "bet",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  { inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }], name: "cancelMarket", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }], name: "claim", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "claimed",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "enum Markets.MarketType", name: "marketType", type: "uint8" },
      { internalType: "enum Markets.EventTemplate", name: "eventTemplate", type: "uint8" },
      { internalType: "uint64", name: "chainKey", type: "uint64" },
      { internalType: "address", name: "sourceContract", type: "address" },
      { internalType: "bytes32", name: "eventSignature", type: "bytes32" },
      { internalType: "address", name: "watchedAddress", type: "address" },
      { internalType: "enum Markets.ComparisonOperator", name: "comparisonOperator", type: "uint8" },
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "uint64", name: "deadline", type: "uint64" },
    ],
    name: "createMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  { inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }], name: "expireMarket", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "getMarket",
    outputs: [
      {
        components: [
          { internalType: "enum Markets.MarketType", name: "marketType", type: "uint8" },
          { internalType: "uint64", name: "chainKey", type: "uint64" },
          { internalType: "enum Markets.MarketStatus", name: "status", type: "uint8" },
          { internalType: "bool", name: "outcome", type: "bool" },
          { internalType: "enum Markets.EventTemplate", name: "eventTemplate", type: "uint8" },
          { internalType: "address", name: "sourceContract", type: "address" },
          { internalType: "address", name: "watchedAddress", type: "address" },
          { internalType: "enum Markets.ComparisonOperator", name: "comparisonOperator", type: "uint8" },
          { internalType: "bytes32", name: "eventSignature", type: "bytes32" },
          { internalType: "uint256", name: "threshold", type: "uint256" },
          { internalType: "uint256", name: "accumulatedValue", type: "uint256" },
          { internalType: "uint256", name: "yesPool", type: "uint256" },
          { internalType: "uint256", name: "noPool", type: "uint256" },
          { internalType: "address", name: "creator", type: "address" },
          { internalType: "uint64", name: "deadline", type: "uint64" },
        ],
        internalType: "struct Markets.Market",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [], name: "nextMarketId", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "owner", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "view", type: "function" },
  {
    inputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    name: "processedQueries",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  { inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }], name: "refund", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "refunded",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint64", name: "chainKey", type: "uint64" },
      { internalType: "uint64", name: "blockHeight", type: "uint64" },
      { internalType: "bytes", name: "encodedTransaction", type: "bytes" },
      {
        components: [
          { internalType: "bytes32", name: "root", type: "bytes32" },
          {
            components: [
              { internalType: "bytes32", name: "hash", type: "bytes32" },
              { internalType: "bool", name: "isLeft", type: "bool" },
            ],
            internalType: "struct INativeQueryVerifier.MerkleProofEntry[]",
            name: "siblings",
            type: "tuple[]",
          },
        ],
        internalType: "struct INativeQueryVerifier.MerkleProof",
        name: "merkleProof",
        type: "tuple",
      },
      {
        components: [
          { internalType: "bytes32", name: "lowerEndpointDigest", type: "bytes32" },
          { internalType: "bytes32[]", name: "roots", type: "bytes32[]" },
        ],
        internalType: "struct INativeQueryVerifier.ContinuityProof",
        name: "continuityProof",
        type: "tuple",
      },
    ],
    name: "resolve",
    outputs: [{ internalType: "bool", name: "success", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "address", name: "", type: "address" },
      { internalType: "bool", name: "", type: "bool" },
    ],
    name: "stakes",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/// Minimal read-only ERC20 ABI, used to fetch `decimals()`/`symbol()` for
/// token-amount threshold fields (see market-creation-brief.md's note on
/// decimal conversion).
export const erc20Abi = [
  { inputs: [], name: "decimals", outputs: [{ internalType: "uint8", name: "", type: "uint8" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "symbol", outputs: [{ internalType: "string", name: "", type: "string" }], stateMutability: "view", type: "function" },
] as const;
