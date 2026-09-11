# Cascade — Demo Video Script

**Target length:** ~4 minutes
**Format:** screen recording (browser + block explorers) with voiceover. Timestamps are guides, not hard cuts.

---

## 0:00–0:25 — Cold open: the problem

**Visual:** Title card "Cascade" fades in over a slow pan of the markets list page. Cut to a simple diagram: a prediction market with a question mark where "resolver" should be, an oracle icon, a multisig icon, a dispute-window clock icon — all crossed out.

**VO:**
> "Prediction markets on real-world events have a trust problem. Someone has to say 'yes, that happened' — an oracle, a multisig, a dispute window with a bonded challenger. Every one of those is a person or committee that can be bribed, censored, or just wrong. And for on-chain events, that's absurd — the truth is already sitting in a block on another chain. It's already public. It's already final. Why are we still paying someone to vouch for it?"

---

## 0:25–0:55 — The idea in one sentence

**Visual:** Redraw the diagram — remove the oracle/multisig/clock, replace with a single arrow: "Sepolia transaction" → "cryptographic proof" → "Creditcoin verifier" → "payout."

**VO:**
> "Cascade is a prediction market where the resolver is math, not a middleman. You create a market on a condition happening on another chain — Ethereum Sepolia, in this demo — and the moment that condition is cryptographically proven to have occurred, the market resolves itself. No admin. No oracle. No dispute window. The bridge that makes this possible is the Attestcoin Protocol, running through Creditcoin's Native Query Verifier precompile."

---

## 0:55–1:25 — Architecture, fast

**Visual:** Show the architecture diagram from the README (or an animated version): Frontend → Markets.sol on Creditcoin → backend watchers → Sepolia → Attestcoin proof builder → back to Markets.sol.

**VO:**
> "Here's the shape of it. Markets live on Creditcoin testnet. The conditions they track — a whale transfer, an Aave borrow spike, a run of Uniswap swaps — happen on Sepolia. Cascade's backend watches both chains: one indexer tracks open markets, the other polls only the Sepolia contracts those markets care about. When a matching event shows up, the backend doesn't just trust what it saw — it waits for Creditcoin to attest that block, pulls an inclusion-and-continuity proof from Attestcoin's Proof Builder, and submits that proof on-chain. The contract re-verifies it itself, live, against the verifier precompile, before it ever pays anyone out."

---

## 1:25–1:55 — Create a market

**Visual:** Screen recording. Open the app, connect a wallet on Creditcoin testnet, click "Create Market." Show the five presets (Aave reserve volume, Aave reserve activity, Aave pool activity, Uniswap swap count, Whale transfer). Select **Whale transfer**.

**VO:**
> "Let's create one live. I don't hand-write event signatures — Cascade gives me five presets: Aave reserve volume, Aave reserve activity, Aave pool activity, Uniswap swap count, and whale transfer. I'll pick whale transfer."

**Visual:** Fill in: token address, the watched address, "at least 500 tokens," a deadline a few minutes out. Click Create, show the wallet signature prompt, then the transaction confirming on Blockscout.

**VO:**
> "I'm watching this token contract, this specific address, and asking: will it move at least 500 tokens before the deadline? I confirm the transaction — that's `createMarket` on `Markets.sol`, live on Creditcoin testnet — and the market's open."

---

## 1:55–2:20 — Bet

**Visual:** From the markets list, open the new market. Place a stake on YES, then (optionally) a smaller stake on NO from a second wallet, each shown as a wallet signature + confirmed tx.

**VO:**
> "Now anyone can stake CTC on yes or no. I'll back yes with a larger stake, and just to make it interesting, a smaller counter-bet on no. Pools accumulate per side — your payout share is proportional to your stake in the winning pool."

---

## 2:20–3:10 — Trigger the real-world event and watch resolution happen

**Visual:** Switch to a Sepolia wallet / script. Send the token transfer that satisfies the condition (e.g., 750 tokens) — show the transaction on Sepolia Etherscan. Cut to the backend logs or `/markets/:id` API response showing the job move through states: detected → waiting on attestation → proof fetched → resolve submitted.

**VO:**
> "Over on Sepolia, I send the transfer that satisfies the market — 750 tokens, above our 500 threshold. Cascade's source watcher picks this up almost immediately. But it doesn't resolve yet — it has to wait for Creditcoin to attest that Sepolia block, which typically takes eight to twenty minutes, then pull a proof from Attestcoin's Proof Builder for this exact transaction."

**Visual:** Cut to Blockscout showing the `resolve` transaction confirming, then the `MarketResolved` event log.

**VO:**
> "Once that proof lands, the backend submits it to `Markets.resolve()`. And this next part is the whole point: the contract doesn't take the backend's word for it. It hands that proof to Creditcoin's Native Query Verifier precompile and checks, on-chain, right now, that the proof is real — inclusion in the block, and continuity of the chain around it. Only then does it decode the transfer event, check the threshold, and flip the market to resolved. If that proof didn't check out, nothing would happen — the backend has zero authority to force an outcome."

---

## 3:10–3:35 — Claim

**Visual:** Back in the frontend, open the resolved market, click "Claim" from the winning wallet, show the wallet confirmation and the CTC balance increase.

**VO:**
> "The market shows resolved: yes. I claim from the winning wallet — stake back, plus a pro-rata share of the losing pool. No admin had to release it, no committee had to sign off. The same proof that convinced the contract is sitting on-chain for anyone to check themselves."

---

## 3:35–4:00 — Why this matters, and close

**Visual:** Return to the architecture diagram, highlight "Native Query Verifier precompile" and "Attestcoin Proof Builder." End card: repo link / contract addresses from the README.

**VO:**
> "This works because of two things Cascade didn't have to build: Creditcoin's verifier precompile, which makes checking a foreign-chain Merkle proof cheap enough to do on every single resolution, and Attestcoin, which actually produces those proofs by attesting external chains. Cascade is just the market contract and the indexer built around them. The result: a prediction market on any cross-chain, on-chain condition, that resolves itself — permissionlessly, provably, and with nobody in the middle."

**Visual:** Fade to title card with tagline.

**On-screen text:** "Cascade — prediction markets resolved by proof, not by permission."

---

## Production notes

- **Pre-record the Sepolia→attestation wait** (8–20 min) and cut to it rather than waiting live; show a timestamp overlay ("14 minutes later...") to be honest about the delay without losing pacing.
- Keep the wallet-confirmation popups brief in the edit — a 1-second flash is enough to establish "this is a real signed transaction," not a mockup.
- If recording fresh rather than reusing the logged end-to-end run in `testrun-logs/`, reuse its same market shape (whale transfer, CTT, 500-token threshold) so narration can match known-good transaction hashes if the live demo has RPC hiccups.
