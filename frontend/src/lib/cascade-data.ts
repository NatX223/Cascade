export type MarketStatus = "open" | "verifying" | "resolved";

export type Market = {
  id: number;
  question: string;
  deadline: string;
  block: number;
  yes: number;
  pool: number;
  status: MarketStatus;
  outcome?: "yes" | "no";
  payout?: string;
  contract?: string;
  kind?: "cumulative" | "oneoff";
  rule?: string;
};

export const MARKETS: Market[] = [
  { id: 1, question: "Will 0xWhale.eth move 100+ ETH before Friday?", deadline: "Resolves at block 9,481,200", block: 9481200, yes: 68, pool: 41.2, status: "open" },
  { id: 2, question: "Will the Sepolia treasury contract's pause switch flip?", deadline: "Resolves at block 9,481,200", block: 9481200, yes: 23, pool: 12.8, status: "open" },
  { id: 3, question: "Will this address's next trade push ETH/USDC below $2,400?", deadline: "Resolves at block 9,492,010", block: 9492010, yes: 51, pool: 88.4, status: "open" },
  { id: 4, question: "Will 0x4c1…9be approve more than 1M USDC to a new spender?", deadline: "Resolves at block 9,488,650", block: 9488650, yes: 34, pool: 27.5, status: "open" },
  { id: 5, question: "Will the vault contract's supply cross 50,000 shares?", deadline: "Resolves at block 9,502,000", block: 9502000, yes: 44, pool: 19.1, status: "open" },
  { id: 6, question: "Will proposal 118 reach quorum before voting closes?", deadline: "Resolves when voting closes on-chain", block: 9496400, yes: 72, pool: 63.7, status: "open" },
  { id: 7, question: "Will 0x88f…c07 mint more than 500 NFTs from this contract?", deadline: "Resolves at block 9,490,300", block: 9490300, yes: 61, pool: 15.3, status: "open" },
  { id: 8, question: "Will the staking contract slash any validator this epoch?", deadline: "Resolves at block 9,479,900", block: 9479900, yes: 19, pool: 8.9, status: "open" },
  { id: 9, question: "Will 0x9d2…41a repay the full loan before liquidation?", deadline: "Proof submitted at block 9,478,140", block: 9478140, yes: 57, pool: 34.6, status: "verifying" },
  { id: 10, question: "Will the lending pool's utilisation cross 90%?", deadline: "Proof submitted at block 9,477,905", block: 9477905, yes: 41, pool: 22.0, status: "verifying" },
  { id: 11, question: "Did 0xWhale.eth send 50+ ETH to an exchange address?", deadline: "Resolved at block 9,470,551", block: 9470551, yes: 74, pool: 52.8, status: "resolved", outcome: "yes", payout: "22.4 CTC paid to yes positions" },
  { id: 12, question: "Did the LP position withdraw before block 9,470,000?", deadline: "Resolved at block 9,470,000", block: 9470000, yes: 38, pool: 30.5, status: "resolved", outcome: "no", payout: "18.9 CTC paid to no positions" },
  { id: 13, question: "Did the bridge contract's owner transfer ownership?", deadline: "Resolved at block 9,468,220", block: 9468220, yes: 12, pool: 11.4, status: "resolved", outcome: "no", payout: "9.8 CTC paid to no positions" },
  { id: 14, question: "Did 0x2e7…b90 deposit 250,000 USDC in a single transaction?", deadline: "Resolved at block 9,465,780", block: 9465780, yes: 66, pool: 44.9, status: "resolved", outcome: "yes", payout: "31.2 CTC paid to yes positions" },
];

export type AbiEventInput = [name: string, type: string, unit: string];
export type AbiEvent = { name: string; signature: string; inputs: AbiEventInput[] };

export const ABI_EVENTS: AbiEvent[] = [
  { name: "Transfer", signature: "event Transfer(address indexed from, address indexed to, uint256 value)", inputs: [["value", "uint256", "ETH"]] },
  { name: "Deposit", signature: "event Deposit(address indexed account, uint256 amount, uint256 shares)", inputs: [["amount", "uint256", "USDC"], ["shares", "uint256", "shares"]] },
  { name: "MetricUpdated", signature: "event MetricUpdated(bytes32 indexed key, uint256 value, uint64 timestamp)", inputs: [["value", "uint256", "units"], ["timestamp", "uint64", "sec"]] },
  { name: "OwnershipTransferred", signature: "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)", inputs: [] },
];
