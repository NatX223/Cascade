# Cascade

Permissionless prediction markets on real-world DeFi events — resolved with no admin, no oracle, and no dispute window, because the outcome is proven on-chain by the **Attestcoin Protocol**.

---

## Table of Contents

1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [Solution](#solution)
4. [Why Creditcoin + Attestcoin Are Pivotal](#why-creditcoin--attestcoin-are-pivotal)
5. [Architecture](#architecture)
6. [How It Works](#how-it-works)
7. [Key Functions](#key-functions)
8. [Deployed Contracts](#deployed-contracts)
9. [End-to-End Test Run — Transactions](#end-to-end-test-run--transactions)
10. [Tech Stack](#tech-stack)
11. [Repository Layout](#repository-layout)
12. [Setup and Run](#setup-and-run)
13. [Follow-ups / Not Yet Built](#follow-ups--not-yet-built)

---

## Overview

Cascade lets anyone create a prediction market on a condition that happens on a **different chain** — "will this address move more than 500 tokens?", "will Aave V3 borrow volume cross X?", "will this Uniswap pool see another swap before the deadline?" — and settles it automatically, the moment that condition is cryptographically proven to have occurred. Markets live on **Creditcoin testnet**; the conditions they track live on **Ethereum Sepolia**. The bridge between the two is **Attestcoin**: a Creditcoin-native protocol that lets a smart contract verify, on-chain, that a specific transaction happened on another chain — no bridge contract holding funds, no oracle committee signing off, no admin key that can resolve a market the "wrong" way.

## Problem Statement

Prediction markets that key off real-world or cross-chain events almost always need a trusted party to say "yes, that happened." That party is usually a centralized oracle, a multisig, or a dispute window with a bonded challenger — all of which introduce delay, cost, and a manipulation surface: whoever resolves the market can be bribed, censored, or simply wrong. For markets on granular on-chain activity (a whale transfer, a lending pool's borrow volume, a DEX's swap count) this is especially wasteful — the ground truth is already sitting in a block on another chain, fully verifiable, yet resolution still routes through a human or a semi-trusted feed.

## Solution

Cascade removes the trusted resolver entirely. A market's condition is defined as a specific event signature on a specific source-chain contract (optionally scoped to one address, with a numeric threshold and comparator). Once that condition is met, the outcome is settled by:

1. detecting the matching transaction on the source chain,
2. fetching an **Attestcoin inclusion + continuity proof** for it — cryptographic evidence that the transaction is really in that chain's history, and
3. submitting that proof to `Markets.sol` on Creditcoin, which verifies it against Creditcoin's own **Native Query Verifier precompile** before paying out.

If nothing ever happens, the market simply expires to NO at its deadline — also permissionless, also with no admin involved. The only privileged action in the whole contract is `cancelMarket`, an owner-only escape hatch for a market whose *definition* (not its outcome) was malformed.

## Why Creditcoin + Attestcoin Are Pivotal

- **Creditcoin testnet** is where `Markets.sol` lives and where CTC is staked, won, and paid out. It's chosen specifically because it exposes the **Native Query Verifier precompile** (`INativeQueryVerifier`) at the protocol level — the primitive that lets a contract verify a foreign-chain transaction's Merkle inclusion proof *and* the continuity of the chain history around it, in a single call, without trusting anything but Creditcoin's own attested state.
- **Attestcoin** (the `@gluwa/asc-contracts` / `@gluwa/usc-sdk` stack) is the protocol that produces those proofs. Creditcoin periodically attests to the state of external chains (Sepolia, Ethereum mainnet, …) via a `chainKey`; once a source block is attested, Attestcoin's Proof Builder service can generate a proof that a given transaction is included in it. `MarketBase.resolve()` hands that proof straight to the verifier precompile — `verifyAndEmit(chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof)` — and only calls into market-resolution logic if it comes back true.
- Together, they're what makes "permissionless, trustless resolution of a cross-chain condition" possible at all: without the precompile, verifying a foreign-chain Merkle proof cheaply on-chain isn't practical; without Attestcoin's attestation + proof-building service, there's no source of the proof to verify in the first place. Cascade doesn't reimplement either — it's a market contract and an off-chain indexer built *around* them.

## Architecture

```
                          +---------------------------------------+
                          |         Frontend (Next.js)            |
                          |   create market / bet / claim / list  |
                          +-------------------+-------------------+
                                              |    ^
                        createMarket / bet /  |    | GET /markets
                        claim (signed tx)     |    | (Firestore + live reads)
                                              v    |
                          +-------------------+--------------------+
                          |     Markets.sol  (Creditcoin testnet)   |
                          |   createMarket, bet, claim, expireMarket|
                          |   resolve() -> verifyAndEmit(proof)     |--------------------+
                          +---------+-------------------+-----------+                    |
                                   ^                   |                                 |
                        resolve(   |                   | MarketCreated                   |
                        marketId,  |                   | MarketResolved                  |
                        proof)     |                   v                                 v
                          +---------+-------------------+----------+      +----+---------------------+
                          |            Cascade Backend             |      | Native Query Verifier    |
                          |                                        |      | precompile               |
                          |  marketsWatcher --> market registry    |      | (verifies inclusion +    |
                          |                          |             |      |  continuity proofs)      |
                          |                          v             |      +--------------------------+
                          |  sourceWatcher <---- open-market watch |
                          |       |               set              |
                          |       v                                |
                          |    matcher --conditionMet--> resolver  |
                          |                                queue   |
                          +-------+------------------------------+-+
                                  |                              |
                       polls      |                              | wait attest / getProof
                       Sepolia    |                              | submit resolve()
                       events     v                              v
                +----------------------------+       +--------------------------------------+
                |   Ethereum Sepolia         |       |      Attestcoin Protocol             |
                |   (source chain)           |       |                                      |
                |  ERC-20 Transfer           |       |  ChainInfo precompile                |
                |  Aave V3 Supply / Borrow   |       |   - attested height per chainKey     |
                |  Uniswap V3 Swap           |       |  Proof Builder service               |
                |                            |       |   - inclusion + continuity proof     |
                +----------------------------+       +--------------------------------------+
```

**Resolution sequence** — the path a matched event takes from Sepolia back to a paid-out market:

```
 1. User        --createMarket(sourceContract, eventSig, watchedAddress, threshold, deadline)-->  Markets.sol
 2. Markets.sol --MarketCreated------------------------------------------------------------->  marketsWatcher (registry updated)
 3. User        --bet(marketId, outcome) [payable]------------------------------------------->  Markets.sol
 4. sourceWatcher polls only the Sepolia contracts referenced by open markets
 5. Sepolia     --matching log (e.g. Transfer, value >= threshold)--------------------------->  matcher
 6. matcher     --conditionMet--------------------------------------------------------------->  resolver queue
 7. resolver    --waitUntilHeightAttested(chainKey, blockHeight)----------------------------->  Attestcoin ChainInfo precompile
 8. resolver    --getProof(txHash)------------------------------------------------------------>  Attestcoin Proof Builder
 9. resolver    --resolve(marketId, chainKey, blockHeight, tx, merkleProof, continuityProof)->  Markets.sol
10. Markets.sol --verifyAndEmit(...)---------------------------------------------------------->  Native Query Verifier precompile
11. Markets.sol --MarketResolved(marketId, outcome)   [only once verified == true]
12. User        --claim(marketId)-------------------------------------------------------------->  Markets.sol --> payout
```

## How It Works

1. **Create a market** — anyone calls `Markets.createMarket(...)` on Creditcoin, defining a source contract, an event signature, an optional watched address, a comparator + threshold, and a deadline. The frontend exposes this as five fixed presets (whale transfer, Aave supply/borrow volume, Aave pool activity, Uniswap swap count) so users never hand-type raw event signatures.
2. **Bet** — anyone stakes native CTC on YES or NO via `bet(marketId, outcome)` before the deadline. Pools accumulate per-outcome; a bettor's share of the winning pool is proportional to their stake.
3. **Watch** — the backend's `sourceWatcher` polls only the Sepolia contracts referenced by currently-open markets; `marketsWatcher` keeps the on-chain market registry in sync by indexing `Markets.sol` events.
4. **Match** — when a source-chain log matches an open market's `(sourceContract, eventSignature, watchedAddress)`, the `matcher` decodes its value per the market's `EventTemplate` and compares it against the threshold (accumulating first, for `Cumulative` markets).
5. **Resolve** — a matched condition enqueues a resolution job. The resolver worker waits for Creditcoin to attest the source block, fetches an Attestcoin inclusion + continuity proof for the exact transaction, then submits `Markets.resolve(...)`. The contract re-verifies the proof itself via the precompile before flipping the market to `Resolved`.
6. **Expire (fallback)** — if the deadline passes with no verified match, anyone can call `expireMarket(marketId)`, which resolves NO with no proof required (there's nothing to disprove).
7. **Claim** — once resolved, winners call `claim(marketId)` for `stake + stake * losingPool / winningPool`. If nobody bet on the winning side, callers instead reclaim their own losing-side stake so funds are never stuck.

## Key Functions

### `createMarket` — define a cross-chain condition (`contracts/contracts/Markets.sol`)

```solidity
function createMarket(
    MarketType marketType,
    EventTemplate eventTemplate,
    uint64 chainKey,
    address sourceContract,
    bytes32 eventSignature,
    address watchedAddress,
    ComparisonOperator comparisonOperator,
    uint256 threshold,
    uint64 deadline
) external returns (uint256 marketId) {
    if (sourceContract == address(0)) revert ZeroAddress();
    if (deadline <= block.timestamp) revert DeadlineInPast();
    if (eventTemplate != EventTemplate.Occurrence && threshold == 0) revert InvalidThreshold();

    marketId = nextMarketId++;
    Market storage m = _markets[marketId];
    m.marketType = marketType;
    m.chainKey = chainKey;
    m.status = MarketStatus.Open;
    m.eventTemplate = eventTemplate;
    m.sourceContract = sourceContract;
    m.watchedAddress = watchedAddress;
    m.comparisonOperator = comparisonOperator;
    m.eventSignature = eventSignature;
    m.threshold = threshold;
    m.creator = msg.sender;
    m.deadline = deadline;

    emit MarketCreated(marketId, msg.sender, marketType, eventTemplate, sourceContract, eventSignature, watchedAddress, threshold, deadline);
}
```

Permissionless by design — safety comes from the condition being independently re-verified at resolution time, not from gatekeeping who may propose a question.

### `resolve` — proof verification gate (`contracts/contracts/MarketBase.sol`)

```solidity
function resolve(
    uint256 marketId,
    uint64 chainKey,
    uint64 blockHeight,
    bytes calldata encodedTransaction,
    INativeQueryVerifier.MerkleProof calldata merkleProof,
    INativeQueryVerifier.ContinuityProof calldata continuityProof
) external returns (bool success) {
    bytes32 queryId = _computeQueryId(chainKey, blockHeight, merkleProof);
    require(!processedQueries[marketId][queryId], "Query already processed for this market");

    bool verified = VERIFIER.verifyAndEmit(chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof);
    require(verified, "Proof of inclusion verification failed");

    processedQueries[marketId][queryId] = true;
    _resolveMarket(marketId, queryId, encodedTransaction);
    return true;
}
```

Every `resolve()` call re-verifies the Attestcoin proof against the live precompile — the contract never trusts the backend's say-so, only the cryptographic proof it hands over.

### `_resolveMarket` — decoding the proved event (`contracts/contracts/Markets.sol`)

```solidity
function _resolveMarket(uint256 marketId, bytes32 /* queryId */, bytes memory encodedTransaction) internal override {
    Market storage m = _markets[marketId];
    if (m.creator == address(0)) revert MarketDoesNotExistOrClosed();
    if (m.status != MarketStatus.Open) revert MarketDoesNotExistOrClosed();
    if (block.timestamp >= m.deadline) revert MarketPastDeadline();

    // The precompile proves inclusion only, not success — checked explicitly.
    EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
    if (receipt.receiptStatus != 1) revert SourceTransactionNotSuccessful();

    EvmV1Decoder.LogEntry memory log = _findMatchingLog(m, receipt);
    _checkActorFilter(m, log);

    if (m.eventTemplate == EventTemplate.Occurrence) {
        _finalizeResolution(m, marketId, true);
        return;
    }

    uint256 value = _decodeValue(m.eventTemplate, log);
    uint256 compareValue = m.marketType == MarketType.Cumulative
        ? (m.accumulatedValue += value)
        : value;

    bool conditionMet = _compare(compareValue, m.threshold, m.comparisonOperator);
    if (m.marketType == MarketType.Cumulative && !conditionMet) return; // stays Open, accumulating

    _finalizeResolution(m, marketId, conditionMet);
}
```

### `claim` — payout with a no-winner fallback (`contracts/contracts/Markets.sol`)

```solidity
function claim(uint256 marketId) external nonReentrant {
    Market storage m = _markets[marketId];
    if (m.status != MarketStatus.Resolved) revert MarketNotResolved();
    if (claimed[marketId][msg.sender]) revert AlreadyClaimed();

    uint256 winningPool = m.outcome ? m.yesPool : m.noPool;
    uint256 losingPool = m.outcome ? m.noPool : m.yesPool;

    uint256 payout;
    if (winningPool == 0) {
        // Nobody was on the winning side — refund the caller's own stake instead
        // of leaving the losing pool permanently unclaimable.
        payout = stakes[marketId][msg.sender][!m.outcome];
        if (payout == 0) revert NoWinningStake();
    } else {
        uint256 winningStake = stakes[marketId][msg.sender][m.outcome];
        if (winningStake == 0) revert NoWinningStake();
        payout = winningStake + (winningStake * losingPool) / winningPool;
    }

    claimed[marketId][msg.sender] = true;
    emit Claimed(marketId, msg.sender, payout);
    (bool sent, ) = msg.sender.call{value: payout}("");
    if (!sent) revert PayoutTransferFailed();
}
```

### `generateProofFor` — fetching the Attestcoin proof (`backend/src/resolution/proof.ts`)

```ts
export async function generateProofFor(
  transactionHash: string,
  chainKey: number,
  proofBuilderUrl: string,
  creditcoinProvider: JsonRpcApiProvider,
  sourceProvider: JsonRpcApiProvider,
): Promise<proofProvider.ProofResult> {
  const receipt = await sourceProvider.getTransactionReceipt(transactionHash);
  if (!receipt) return { success: false, error: `source tx ${transactionHash} not found / not mined` };

  const builder = new proofProvider.service.ProofBuilder(chainKey, proofBuilderUrl);

  // Attestation typically trails the source chain by ~8-20 minutes.
  await builder.waitUntilHeightAttested(
    chainKey,
    receipt.blockNumber,
    env.PROOF_ATTEST_POLL_INTERVAL_MS,
    env.PROOF_ATTEST_TIMEOUT_MS,
  );

  return builder.getProof(transactionHash);
}
```

### `submitResolveAndAwait` — submitting the proof on-chain (`backend/src/resolution/queue.ts`)

```ts
const gasLimit = await utils.gas.computeGasLimit(
  creditcoinProvider as never,
  contract as never,
  encoded,
  resolverWallet.address,
  continuityProof.roots.length,
);

const tx = await contract.getFunction("resolve")(...args, { gasLimit });
const receipt: TransactionReceipt = await tx.wait();

for (const rlog of receipt.logs) {
  const parsed = contract.interface.parseLog({ topics: [...rlog.topics], data: rlog.data });
  if (parsed?.name === "MarketResolved" && parsed.args.marketId === BigInt(marketId)) {
    outcome = Boolean(parsed.args.outcome);
    sawEvent = true;
  }
}
```

One job per `(marketId, transactionHash)`; proofs are cached per `(chainKey, txHash)` so a single source transaction that satisfies several markets only costs one Proof Builder round trip.

## Deployed Contracts

| Contract | Chain | Address | Notes |
| --- | --- | --- | --- |
| `Markets` | Creditcoin testnet (102031) | [`0x0a0d9f5875b54d9adfa4Fc121D9C5f70EEE2450f`](https://creditcoin-testnet.blockscout.com/address/0x0a0d9f5875b54d9adfa4Fc121D9C5f70EEE2450f) | Single contract for every market — no per-market deploys |
| `TestToken` (CTT) | Sepolia (11155111) | [`0xE8473Df91c4EB7cf0972E9dfb856329B84154920`](https://sepolia.etherscan.io/address/0xE8473Df91c4EB7cf0972E9dfb856329B84154920) | Test ERC-20 used as a source-chain condition (whale-transfer market) for the e2e run |

## End-to-End Test Run — Transactions

The full pipeline (create → bet → source event → detect → prove → resolve → claim) was run against live testnets on 2026-09-10 (full log: `testrun-logs/README.md`). Market 1: `SingleEvent` / `SingleWordValue`, watching CTT `Transfer` events from a specific Sepolia address, resolving YES if `value >= 500 CTT`.

| Function | Chain | Transaction Hash | Purpose |
| --- | --- | --- | --- |
| `TestToken` deploy | Sepolia | [`0x07fd76fb0c3b8387f3e95308ea46afdf99d9088615d239171b3e33e11b15896b`](https://sepolia.etherscan.io/tx/0x07fd76fb0c3b8387f3e95308ea46afdf99d9088615d239171b3e33e11b15896b) | Deploy the CTT test ERC-20 used as the market's source contract |
| `createMarket` | Creditcoin testnet | [`0xc8d8e039dfeed84795305097410450fc3572e5c000353d327a2667154f5bde5c`](https://creditcoin-testnet.blockscout.com/tx/0xc8d8e039dfeed84795305097410450fc3572e5c000353d327a2667154f5bde5c) | Create market 1 — watch CTT `Transfer`, threshold `500e18`, GTE |
| `bet` (YES) | Creditcoin testnet | [`0x54533ca318e7195a09b16368e3ffd782a58bac08775d1f2af3df585ca5b8e78e`](https://creditcoin-testnet.blockscout.com/tx/0x54533ca318e7195a09b16368e3ffd782a58bac08775d1f2af3df585ca5b8e78e) | Stake 0.002 CTC on YES |
| `bet` (NO) | Creditcoin testnet | [`0xd6d8e7aeb314a87c85639db780ffafce53d09ebb9f9d66d74297d7665c121752`](https://creditcoin-testnet.blockscout.com/tx/0xd6d8e7aeb314a87c85639db780ffafce53d09ebb9f9d66d74297d7665c121752) | Stake 0.001 CTC on NO |
| `transfer` (source event) | Sepolia | [`0x52cef4fcac54534847a3b44a06bd572a8af31b258967c38e9ca962700c32a67f`](https://sepolia.etherscan.io/tx/0x52cef4fcac54534847a3b44a06bd572a8af31b258967c38e9ca962700c32a67f) | 600 CTT transfer — matched by the watcher, but this run's resolution attempt exhausted its retries on flaky public RPC timeouts |
| `transfer` (source event, retry) | Sepolia | [`0x2a16329f3635742b8d106dc0b9d989382a8a6f73ae8dc8a91d5ebbd8ae45e7d2`](https://sepolia.etherscan.io/tx/0x2a16329f3635742b8d106dc0b9d989382a8a6f73ae8dc8a91d5ebbd8ae45e7d2) | 750 CTT transfer — the transaction actually proven and resolved against |
| `resolve` | Creditcoin testnet | [`0xf4a474c2538dddc565607be7cd9c9c2afd3c6d2ccf20e5ece254ec94f869dcf1`](https://creditcoin-testnet.blockscout.com/tx/0xf4a474c2538dddc565607be7cd9c9c2afd3c6d2ccf20e5ece254ec94f869dcf1) | Submit the Attestcoin proof for the 750 CTT transfer; verified on-chain, emits `MarketResolved(1, true)` |
| `claim` | Creditcoin testnet | [`0x2ef98c62589d1d29b604085bb1800319cc3ccd20ccbb4cae7d2dab191e0d830f`](https://creditcoin-testnet.blockscout.com/tx/0x2ef98c62589d1d29b604085bb1800319cc3ccd20ccbb4cae7d2dab191e0d830f) | Claim payout — 0.002 stake + 0.001 pro-rata winnings = 0.003 CTC |

## Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Smart contracts | Solidity 0.8.28, Hardhat 2, OpenZeppelin | `Markets.sol` / `MarketBase.sol` — market lifecycle + proof-gated resolution |
| Cross-chain verification | `@gluwa/asc-contracts` (Solidity), `@gluwa/usc-sdk` (TypeScript) | Attestcoin proof generation, `INativeQueryVerifier` precompile bindings |
| Backend | Node.js, TypeScript, Express, viem, ethers v6 | Two-chain indexer, matcher, resolution job queue, REST API |
| Persistence | Firebase Admin / Firestore | Frontend-authored market metadata (question text, presets) not derivable from chain state |
| Frontend | Next.js 16, React 19, wagmi, viem, RainbowKit | Market creation UI, betting, live on-chain reads |
| Source chain | Ethereum Sepolia | Where the real DeFi conditions (ERC-20 transfers, Aave Supply/Borrow, Uniswap V3 swaps) occur |
| Markets chain | Creditcoin testnet (102031) | Hosts `Markets.sol` and the Native Query Verifier precompile; settlement currency is CTC |

## Repository Layout

```
Cascade/
├── contracts/          Hardhat project — Markets.sol, MarketBase.sol, TestToken.sol,
│                        deployment + interaction scripts (createMarket, bet, claim, ...)
├── backend/             Two-chain watcher, matcher, resolution queue, REST API (see backend/README.md)
├── frontend/             Next.js app — create/browse/bet/claim UI, wagmi contract bindings
└── testrun-logs/         Logs + write-up from the live end-to-end test run (gitignored)
```

## Setup and Run

### Prerequisites

- Node.js 18+
- A funded Creditcoin testnet account (CTC) for deploying/creating markets/betting
- A funded Sepolia account, only if you want to trigger real source-chain events

### 1. Smart contracts (`contracts/`)

```bash
cd contracts
npm install
cp .env.example .env        # set PRIVATE_KEY (Creditcoin) and, optionally, SEPOLIA_PRIVATE_KEY
npm run compile

# Deploy Markets.sol to Creditcoin testnet (already deployed — see Deployed Contracts above)
npm run deploy:markets:creditcoin-testnet

# Exercise it
npm run market:create     # env overrides: CHAIN_KEY, SOURCE_CONTRACT, EVENT_SIG, WATCHED_ADDRESS, THRESHOLD, DEADLINE_SECONDS
npm run market:bet        # env: MARKET_ID, OUTCOME (yes/no), AMOUNT
npm run market:claim      # env: MARKET_ID

# Optional: deploy + use the Sepolia test token to trigger a real source event
npm run token:deploy:sepolia
npm run token:mint:sepolia
npm run token:transfer:sepolia
```

### 2. Backend (`backend/`)

```bash
cd backend
npm install
cp .env.example .env
# set MARKETS_CONTRACT_ADDRESS to the deployed Markets.sol address
# set RESOLVER_PRIVATE_KEY to enable the resolver (otherwise it stays idle — the
# matcher still flags conditionMet, but nothing calls resolve() on-chain)
npm run dev
```

The backend runs two indexers (`marketsWatcher` on Creditcoin, `sourceWatcher` on Sepolia — the latter only polls contracts referenced by currently-open markets) plus the resolution queue, and serves:

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | last indexed block per chain |
| GET | `/markets` | `?status=Open&limit=100&offset=0` |
| GET | `/markets/:id` | config + progress + resolution job status |
| POST | `/markets` | persist frontend market metadata to Firestore (needs `CRED`) |

### 3. Frontend (`frontend/`)

```bash
cd frontend
npm install
cp .env.example .env.local
# set NEXT_PUBLIC_API_BASE_URL to the backend's URL (default http://localhost:4000)
# NEXT_PUBLIC_MARKETS_CONTRACT_ADDRESS / NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID as needed
npm run dev
```

Open `http://localhost:3000` — connect a wallet on Creditcoin testnet to create markets, bet, and claim.
