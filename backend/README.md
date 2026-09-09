# Cascade backend

Watches the **source chain** (Ethereum Sepolia) for the DeFi events that
prediction markets are built on, and matches them against the market registry it
builds by indexing **`Markets.sol`** on Creditcoin testnet.

This is the scaffold — it runs, but persistence is in-memory. The resolution
step (fetching Attestcoin proofs and submitting `Markets.resolve(...)`) is
implemented but idle until `RESOLVER_PRIVATE_KEY` + `MARKETS_CONTRACT_ADDRESS`
are set.

## Two chains, two watchers

| Watcher | Chain | Watches | Purpose |
| --- | --- | --- | --- |
| `marketsWatcher` | Creditcoin testnet (102031) | `Markets.sol` events (`MarketCreated`, `MarketResolved`, `MarketCancelled`, …) | Keeps the registry of markets + their watch config |
| `sourceWatcher` | Ethereum Sepolia (11155111) | ERC20 `Transfer`, Aave V3 `Supply`/`Borrow`, Uniswap V3 `Swap` | Detects when a market's real-world condition is met |
| `resolver` | Creditcoin testnet (102031) | its own in-memory job queue | Fetches the Attestcoin proof for a matched source tx and submits `Markets.resolve(...)` |

## Resolution pipeline

When the matcher flags a market's condition as met it calls `enqueueResolution`.
A worker loop (`src/resolution/queue.ts`) then, off the polling path:

1. waits for the source block to be attested on Creditcoin, via
   `@gluwa/usc-sdk`'s `ProofBuilder.waitUntilHeightAttested` (~8–20 min);
2. fetches the inclusion + continuity proof (`generateProofFor`, ported from the
   Creditcoin SDK reference `index.ts`) — cached per `(chainKey, txHash)` so one
   source tx resolving several markets only hits the Proof Builder once;
3. submits `Markets.resolve(marketId, chainKey, blockHeight, txBytes, merkleProof,
   continuityProof)` with the SDK's `computeGasLimit` (precompile
   estimateGas-fallback included), and parses `MarketResolved` out of the receipt.

Jobs live in `repositories.resolutions` (in-memory) with a status
(`queued → proving → submitting → submitted/resolved`, or `failed` after
`RESOLUTION_MAX_ATTEMPTS`) and are visible at `GET /markets/:id` under
`resolution`. On restart the worker re-enqueues every non-terminal job and every
still-`Open` market whose progress says `conditionMet`. A duplicate `resolve()`
for an already-resolved market reverts harmlessly against the contract's
`processedQueries` check.

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
   condition met  ──►  resolver queue: wait for attestation, fetch Attestcoin
                       proof, call Markets.resolve(...)  ──►  MarketResolved
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
  chain/resolverClients.ts ethers provider/wallet + resolve() ABI (SDK is ethers)
  resolution/
    proof.ts               generateProofFor — Attestcoin proof via @gluwa/usc-sdk
    queue.ts               job queue + worker: proof -> Markets.resolve(...)
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

- Real persistence (Postgres / SQLite) behind the existing repository interfaces
  — the resolution job queue is in-memory too, so a restart mid-proof restarts
  that proof from scratch (safe, just slow)
- Group source polling by `(sourceContract, eventSignature)` instead of the
  current union-of-addresses single filter, per the watcher grouping brief
- Pool / stake projection from `BetPlaced` / `Claimed` / `Refunded`
- Backfill from each contract's deployment block; reorg handling beyond
  `INDEXER_CONFIRMATIONS`
- `expireMarket` sweeps for markets whose deadline passed with no match
- WebSocket / SSE push; tests
