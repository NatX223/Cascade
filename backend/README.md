# Cascade backend

Watches the **source chain** (Ethereum Sepolia) for the DeFi events that
prediction markets are built on, and matches them against the market registry it
builds by indexing **`Markets.sol`** on Creditcoin testnet.

This is the scaffold — it runs, but persistence is in-memory and the resolution
step (submitting Attestcoin proofs) is not built yet.

## Two chains, two watchers

| Watcher | Chain | Watches | Purpose |
| --- | --- | --- | --- |
| `marketsWatcher` | Creditcoin testnet (102031) | `Markets.sol` events (`MarketCreated`, `MarketResolved`, `MarketCancelled`, …) | Keeps the registry of markets + their watch config |
| `sourceWatcher` | Ethereum Sepolia (11155111) | ERC20 `Transfer`, Aave V3 `Supply`/`Borrow`, Uniswap V3 `Swap` | Detects when a market's real-world condition is met |

`sourceWatcher` only polls contracts that an **open, not-yet-expired** market
actually references — the watch set is derived live from the registry.

## Flow

```
Markets.sol (Creditcoin)          Sepolia
   MarketCreated  ─────►  registry ─────►  which (contract, event, actor) to watch
                                              │
   Sepolia log matches a market ◄─────────────┘
                                              │
   decode value per EventTemplate  ──►  accumulate / compare vs threshold
                                              │
   condition met  ──►  [TODO] fetch Attestcoin proof, call Markets.resolve(...)
```

## Layout

```
src/
  index.ts                 entrypoint — API + both watchers in one process
  config/env.ts            zod-validated config for both chains
  chain/
    clients.ts             viem public clients: marketsClient + sourceClient
    marketsAbi.ts          Markets.sol ABI (events + getMarket), hand-synced
    sourceEvents.ts        Transfer / Supply / Borrow / Swap ABIs + signatures
  indexer/
    poller.ts              generic confirmations-aware block poller w/ cursor
    marketsWatcher.ts      Creditcoin: builds the market registry
    marketsHandlers        (inlined in marketsWatcher for now)
    sourceWatcher.ts       Sepolia: polls source contracts, decodes logs
    matcher.ts             source log -> matching markets -> progress update
  db/repositories.ts       storage interfaces + in-memory implementations
  api/
    server.ts              express app + /health
    routes/markets.ts      GET /markets, GET /markets/:id
  types.ts                 shared record shapes
```

## Setup

```bash
cd backend
npm install
cp .env.example .env       # set MARKETS_CONTRACT_ADDRESS once Markets.sol is deployed
npm run dev
```

Until `MARKETS_CONTRACT_ADDRESS` is set, the markets watcher idles and there are
no markets, so the source watcher polls nothing (its cursor still advances).

## API

| Method | Path            | Notes                                                    |
| ------ | --------------- | ------------------------------------------------------- |
| GET    | `/health`       | last indexed block on each chain                        |
| GET    | `/markets`      | `?status=Open&limit=100&offset=0`                       |
| GET    | `/markets/:id`  | config + `progress` + Markets.sol events + source events |

## Signature check

The four source-event selectors in `chain/sourceEvents.ts` were verified with
`toEventSelector()` against the `*_SIG` constants in
`contracts/contracts/Markets.sol` — they match.

## Follow-ups (not done)

- **Resolution**: fetch the Attestcoin inclusion proof for a matched source tx
  and call `Markets.resolve(...)` — currently the matcher only flags
  `conditionMet`
- Real persistence (Postgres / SQLite) behind the existing repository interfaces
- Pool / stake projection from `BetPlaced` / `Claimed` / `Refunded`
- Backfill from each contract's deployment block; reorg handling beyond
  `INDEXER_CONFIRMATIONS`
- `expireMarket` sweeps for markets whose deadline passed with no match
- WebSocket / SSE push; tests
