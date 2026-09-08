// Markets contract ABI — kept in sync by hand with
// contracts/contracts/Markets.sol (and frontend/src/lib/contracts/markets.ts).
//
// Only the pieces the backend needs are included: all events (for the indexer)
// plus the read-only views used to hydrate market state. Add write-function
// fragments here if the backend ever needs to simulate/encode them.

export const marketsAbi = [
  // ── Events ────────────────────────────────────────────────────────────────
  {
    anonymous: false,
    type: "event",
    name: "MarketCreated",
    inputs: [
      { indexed: true, name: "marketId", type: "uint256" },
      { indexed: true, name: "creator", type: "address" },
      { indexed: false, name: "marketType", type: "uint8" },
      { indexed: false, name: "eventTemplate", type: "uint8" },
      { indexed: false, name: "sourceContract", type: "address" },
      { indexed: false, name: "eventSignature", type: "bytes32" },
      { indexed: false, name: "watchedAddress", type: "address" },
      { indexed: false, name: "threshold", type: "uint256" },
      { indexed: false, name: "deadline", type: "uint256" },
    ],
  },
  {
    anonymous: false,
    type: "event",
    name: "MarketResolved",
    inputs: [
      { indexed: true, name: "marketId", type: "uint256" },
      { indexed: false, name: "outcome", type: "bool" },
    ],
  },
  {
    anonymous: false,
    type: "event",
    name: "MarketCancelled",
    inputs: [{ indexed: true, name: "marketId", type: "uint256" }],
  },
  {
    anonymous: false,
    type: "event",
    name: "BetPlaced",
    inputs: [
      { indexed: true, name: "marketId", type: "uint256" },
      { indexed: true, name: "bettor", type: "address" },
      { indexed: false, name: "outcome", type: "bool" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
  {
    anonymous: false,
    type: "event",
    name: "Claimed",
    inputs: [
      { indexed: true, name: "marketId", type: "uint256" },
      { indexed: true, name: "bettor", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
  {
    anonymous: false,
    type: "event",
    name: "Refunded",
    inputs: [
      { indexed: true, name: "marketId", type: "uint256" },
      { indexed: true, name: "bettor", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },

  // ── Read-only views ───────────────────────────────────────────────────────
  {
    type: "function",
    name: "nextMarketId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getMarket",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "marketType", type: "uint8" },
          { name: "chainKey", type: "uint64" },
          { name: "status", type: "uint8" },
          { name: "outcome", type: "bool" },
          { name: "eventTemplate", type: "uint8" },
          { name: "sourceContract", type: "address" },
          { name: "watchedAddress", type: "address" },
          { name: "comparisonOperator", type: "uint8" },
          { name: "eventSignature", type: "bytes32" },
          { name: "threshold", type: "uint256" },
          { name: "accumulatedValue", type: "uint256" },
          { name: "yesPool", type: "uint256" },
          { name: "noPool", type: "uint256" },
          { name: "creator", type: "address" },
          { name: "deadline", type: "uint64" },
        ],
      },
    ],
  },
] as const;

// Ordinal enums — must match the Solidity declaration order in Markets.sol.
export const MarketType = { 0: "SingleEvent", 1: "Cumulative" } as const;
export const MarketStatus = { 0: "Open", 1: "Resolved", 2: "Cancelled" } as const;
export const ComparisonOperator = { 0: "GTE", 1: "LTE", 2: "EQ" } as const;
export const EventTemplate = {
  0: "Occurrence",
  1: "SingleWordValue",
  2: "AddressPrefixedValue",
  3: "EventCount",
} as const;

/** Event names the indexer subscribes to. */
export const INDEXED_EVENTS = [
  "MarketCreated",
  "MarketResolved",
  "MarketCancelled",
  "BetPlaced",
  "Claimed",
  "Refunded",
] as const;

export type IndexedEventName = (typeof INDEXED_EVENTS)[number];
