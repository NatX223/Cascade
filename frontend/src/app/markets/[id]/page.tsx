"use client";

import { use, useState } from "react";
import Link from "next/link";
import { formatEther, parseEther } from "viem";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import landing from "../../page.module.css";
import marketsStyles from "../page.module.css";
import styles from "./page.module.css";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { creditcoinTestnet } from "@/config/web3";
import { MARKETS_CONTRACT_ADDRESS, marketsAbi } from "@/lib/contracts/markets";
import { shortAddress, type MarketView } from "@/lib/market-view";
import { useMarket } from "@/lib/useMarkets";

const EM_DASH = "—";
const SANS = "'General Sans', sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function deriveDetail(v: MarketView) {
  const statusPulsing = v.statusKey === "open" && v.deadlinePassed;

  const ruleLine = `Settles from the ${v.eventName} log on the source chain ${EM_DASH} ${v.comparisonWord} ${v.thresholdLabel}${
    v.isCumulative ? " in total" : ""
  }.`;

  const stats = [
    { label: "Pool", value: v.hasChain ? `${v.poolLabel} CTC` : EM_DASH },
    { label: "Yes pool", value: v.hasChain ? `${formatEther(v.yesPool)} CTC` : EM_DASH },
    { label: "No pool", value: v.hasChain ? `${formatEther(v.noPool)} CTC` : EM_DASH },
    { label: v.deadlinePassed ? "Deadline" : "Time left", value: v.deadlinePassed ? "Passed" : v.timeLeftLabel },
  ];

  const spec = [
    {
      label: "Market type",
      value: v.isCumulative
        ? "Cumulative — matching events add up until the deadline"
        : "One-off — the first matching event settles it",
      font: SANS,
    },
    { label: "Watched event", value: v.eventName, font: SANS },
    { label: "Source contract", value: v.sourceContract, font: MONO },
    { label: "Event signature", value: v.eventSignature, font: MONO },
    ...(v.watchedAddress ? [{ label: "Watched address", value: v.watchedAddress, font: MONO }] : []),
    { label: "Condition", value: `${v.comparisonWord} ${v.thresholdLabel}`, font: SANS },
    { label: "Deadline", value: v.deadlineLabel, font: SANS },
    { label: "Created by", value: v.creator, font: MONO },
  ];

  const stepReached = v.statusKey === "resolved" || v.statusKey === "cancelled" ? 3 : v.deadlinePassed ? 2 : 1;
  const stepDefs: [string, string][] = [
    ["Market opened", "Spec locked on-chain, betting open"],
    ["Watching for the event", v.progressLabel],
    ["Deadline", `${v.deadlineLabel} · positions lock`],
    [
      v.statusKey === "cancelled" ? "Cancelled" : "Resolved",
      v.statusKey === "resolved"
        ? v.outcome === "yes"
          ? "Settled YES from the proof"
          : "Settled NO from the proof"
        : v.statusKey === "cancelled"
          ? "Stakes are refundable"
          : "Waiting on the Attestcoin proof",
    ],
  ];
  const steps = stepDefs.map(([title, meta], i) => {
    const state = i < stepReached ? "done" : i === stepReached ? "active" : "todo";
    return {
      title,
      meta,
      titleColor: state === "todo" ? "#6B6889" : "#F5F4FB",
      dot: state === "done" ? "#3DDC97" : state === "active" ? "#2FE6D9" : "#3B3B57",
      dotBg: state === "todo" ? "#0A0A16" : "rgba(47,230,217,.08)",
      dotBorder: state === "todo" ? "#28283F" : state === "done" ? "rgba(61,220,151,.4)" : "#2FE6D9",
      railHeight: i === stepDefs.length - 1 ? "0px" : "18px",
    };
  });

  const lockedTitle =
    v.statusKey === "cancelled"
      ? "Market cancelled"
      : v.statusKey === "resolved"
        ? v.outcome === "yes"
          ? "Resolved yes"
          : "Resolved no"
        : "Awaiting resolution";
  const lockedBody =
    v.statusKey === "cancelled"
      ? "This market was cancelled before it resolved. Anyone who staked can withdraw their bet in full."
      : v.statusKey === "resolved"
        ? `The proof settled this market ${v.outcome?.toUpperCase()}. Payouts went to ${v.outcome} positions in the same transaction.`
        : "The deadline has passed. Once the Attestcoin proof lands, the market resolves and payouts are released.";

  return {
    typeLabel: v.typeLabel,
    ruleLine,
    statusLabel: v.statusLabel,
    statusColor: v.statusColor,
    statusPulsing,
    isCumulative: v.isCumulative,
    stats,
    spec,
    steps,
    traderLine: v.hasChain ? `${v.yesPct}% YES · ${100 - v.yesPct}% NO by pool` : "No pool data yet",
    contract: v.sourceContract,
    contractShort: shortAddress(v.sourceContract),
    eventName: v.eventName,
    emissionsLabel: v.hasChain && v.accumulatedValue !== null ? v.progressLabel : EM_DASH,
    runningTotalLabel: v.progressLabel,
    progressPct: v.progressPct,
    progressLine: v.progressLabel,
    timeLeftLabel: v.deadlinePassed ? "Deadline passed" : v.timeLeftLabel,
    lockedTitle,
    lockedBody,
  };
}

export default function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { view, isLoading, notFound, error, refetchChain } = useMarket(id);

  return (
    <div
      className={landing.page}
      style={{
        background: "#0A0A16",
        color: "#F5F4FB",
        fontFamily: "'General Sans', system-ui, sans-serif",
        fontSize: 16,
        lineHeight: 1.5,
        minHeight: "100vh",
        overflowX: "hidden",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          padding: "20px 48px",
          background: "rgba(10,10,22,.82)",
          backdropFilter: "blur(18px)",
          borderBottom: "1px solid #28283F",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12, color: "#F5F4FB" }}>
          <div className={landing.corner} style={{ width: 30, height: 30, borderRadius: 10, background: "linear-gradient(135deg,#7C5CFF,#2FE6D9)", display: "grid", placeItems: "center" }}>
            <div className={landing.corner} style={{ width: 11, height: 11, borderRadius: 4, background: "#0A0A16" }} />
          </div>
          <span style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 600, fontSize: 21, letterSpacing: "-0.02em" }}>Cascade</span>
        </Link>
        <nav style={{ display: "flex", alignItems: "center", gap: 32, fontSize: 15, color: "#A5A3BE" }}>
          <Link href="/markets" style={{ color: "#F5F4FB" }}>
            Markets
          </Link>
          <Link href="/#resolution" className={landing.navLink}>
            Resolution
          </Link>
          <Link href="/#how" className={landing.navLink}>
            How it works
          </Link>
        </nav>
        <ConnectWalletButton size="sm" />
      </header>

      <main style={{ maxWidth: 1440, margin: "0 auto", padding: "32px 48px 96px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#6B6889" }}>
          <Link href="/markets" className={styles.contractLink} style={{ color: "#6B6889" }}>
            Markets
          </Link>
          <span>/</span>
          <span style={{ color: "#A5A3BE" }}>{/^\d+$/.test(id) ? `CSC-${id.padStart(4, "0")}` : id}</span>
        </div>

        {isLoading ? (
          <div className={`${landing.corner} ${landing.livePulse}`} style={{ marginTop: 22, height: 320, background: "#151527", border: "1px solid #28283F", borderRadius: 32 }} />
        ) : !view || notFound ? (
          <div className={landing.corner} style={{ marginTop: 22, padding: "64px 40px", textAlign: "center", background: "#151527", border: "1px solid #28283F", borderRadius: 32 }}>
            <h1 style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 500, fontSize: 28, letterSpacing: "-0.02em", margin: 0 }}>
              {error ? "Couldn't load this market" : "Market not found"}
            </h1>
            <p style={{ margin: "12px auto 26px", color: "#A5A3BE", maxWidth: "52ch", overflowWrap: "anywhere" }}>
              {error
                ? error.message
                : "This market isn't in the registry. It may have been created on-chain without being saved, or the id is wrong."}
            </p>
            <Link
              href="/markets"
              className={`${landing.corner} ${landing.btnPrimary}`}
              style={{ display: "inline-block", fontFamily: "'General Sans', sans-serif", fontSize: 15, fontWeight: 500, color: "#0A0A16", background: "#7C5CFF", padding: "13px 22px", borderRadius: 14 }}
            >
              Browse open markets
            </Link>
          </div>
        ) : (
          <MarketDetail view={view} refetchChain={refetchChain} />
        )}
      </main>

      <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, flexWrap: "wrap", padding: "28px 48px", borderTop: "1px solid #28283F", fontSize: 14, color: "#6B6889" }}>
        <span>Cascade {EM_DASH} a trustless prediction market for on-chain events</span>
        <div style={{ display: "flex", gap: 28 }}>
          <Link href="/" className={landing.footerLink}>
            Home
          </Link>
          <Link href="/markets" className={landing.footerLink}>
            Markets
          </Link>
          <Link href="/#resolution" className={landing.footerLink}>
            Contracts
          </Link>
        </div>
      </footer>
    </div>
  );
}

function MarketDetail({ view: v, refetchChain }: { view: MarketView; refetchChain: () => void }) {
  const d = deriveDetail(v);
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [stake, setStake] = useState("10");

  // ── On-chain bet wiring ──────────────────────────────────────────────────
  // Bets go to this market's real on-chain id.
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [betPending, setBetPending] = useState(false);
  const [betError, setBetError] = useState<string | null>(null);
  const [betTxHash, setBetTxHash] = useState<string | null>(null);

  async function placeBet() {
    setBetError(null);
    setBetTxHash(null);
    if (!isConnected) {
      setBetError("Connect a wallet to place a bet.");
      return;
    }
    let value: bigint;
    try {
      value = parseEther((stake || "0").trim());
    } catch {
      setBetError("Enter a valid stake amount.");
      return;
    }
    if (value <= BigInt(0)) {
      setBetError("Enter a stake greater than 0.");
      return;
    }
    if (v.statusKey !== "open") {
      setBetError("This market is no longer open.");
      return;
    }
    setBetPending(true);
    try {
      if (chainId !== creditcoinTestnet.id) {
        await switchChainAsync({ chainId: creditcoinTestnet.id });
      }
      const hash = await writeContractAsync({
        address: MARKETS_CONTRACT_ADDRESS,
        abi: marketsAbi,
        functionName: "bet",
        args: [BigInt(v.marketId), side === "yes"],
        value,
      });
      setBetTxHash(hash);
      await publicClient?.waitForTransactionReceipt({ hash });
      refetchChain();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transaction failed";
      setBetError(message.length > 200 ? message.slice(0, 200) + "…" : message);
    } finally {
      setBetPending(false);
    }
  }

  const no = 100 - v.yesPct;
  const price = (side === "yes" ? v.yesPct : no) / 100;
  const stakeNum = Math.max(0, parseFloat(stake) || 0);
  const shares = price > 0 ? stakeNum / price : 0;
  const profit = shares - stakeNum;
  const roi = stakeNum > 0 ? (profit / stakeNum) * 100 : 0;

  const sides = (
    [
      ["yes", "Yes", v.yesPct],
      ["no", "No", no],
    ] as const
  ).map(([key, label, pct]) => ({
    key,
    label,
    price: `${pct}¢`,
    fg: side === key ? (key === "yes" ? "#3DDC97" : "#FF5C7A") : "#A5A3BE",
    bg: side === key ? (key === "yes" ? "rgba(61,220,151,.12)" : "rgba(255,92,122,.12)") : "#0A0A16",
    border: side === key ? (key === "yes" ? "rgba(61,220,151,.45)" : "rgba(255,92,122,.45)") : "#28283F",
  }));

  const quote = [
    { label: "Price", value: `${Math.round(price * 100)}¢ per share`, color: "#F5F4FB" },
    { label: "Shares", value: shares.toFixed(2), color: "#F5F4FB" },
    { label: `Payout if ${side} wins`, value: `${shares.toFixed(2)} CTC (+${roi.toFixed(0)}%)`, color: side === "yes" ? "#3DDC97" : "#FF5C7A" },
  ];

  const ctaBg = side === "yes" ? "#3DDC97" : "#FF5C7A";
  const ctaLabel = `Buy ${side === "yes" ? "Yes" : "No"} at ${Math.round(price * 100)}¢`;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 384px", gap: 28, alignItems: "start", marginTop: 22 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
        <div className={landing.corner} style={{ display: "flex", flexDirection: "column", gap: 18, padding: 30, background: "#151527", border: "1px solid #28283F", borderRadius: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
            <span className={landing.corner} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 10, background: "rgba(61,220,151,.1)", color: d.statusColor }}>
              <span className={`${landing.corner} ${d.statusPulsing ? landing.provingPulse : ""}`} style={{ width: 7, height: 7, borderRadius: 3, background: d.statusColor }} />
              {d.statusLabel}
            </span>
            <span className={landing.corner} style={{ padding: "6px 12px", borderRadius: 10, background: "#1E1E36", border: "1px solid #28283F", color: "#A5A3BE" }}>
              {d.typeLabel}
            </span>
            <span className={landing.corner} style={{ padding: "6px 12px", borderRadius: 10, background: "#1E1E36", border: "1px solid #28283F", color: "#A5A3BE", fontVariantNumeric: "tabular-nums" }}>
              {v.deadlinePassed ? "Ended" : "Resolves"} {v.deadlineLabel}
            </span>
          </div>

          <h1 style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 600, fontSize: 42, lineHeight: 1.08, letterSpacing: "-0.035em", margin: 0 }}>{v.question}</h1>
          <p style={{ margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13.5, color: "#6B6889" }}>{d.ruleLine}</p>

          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, marginTop: 6 }}>
            <div>
              <div style={{ fontSize: 13, color: "#6B6889" }}>Yes{v.hasChain ? "" : " (no bets yet)"}</div>
              <div style={{ fontFamily: "'Clash Display', sans-serif", fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1, color: "#3DDC97", fontVariantNumeric: "tabular-nums" }}>{v.yesPct}%</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, color: "#6B6889" }}>No</div>
              <div style={{ fontFamily: "'Clash Display', sans-serif", fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1, color: "#FF5C7A", fontVariantNumeric: "tabular-nums" }}>{no}%</div>
            </div>
          </div>
          <div className={landing.corner} style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", background: "#0A0A16" }}>
            <div style={{ background: "#3DDC97", transition: "width 700ms ease-out", width: `${v.yesPct}%` }} />
            <div style={{ flex: 1, background: "#FF5C7A" }} />
          </div>

          <div className={landing.corner} style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, marginTop: 10, background: "#28283F", border: "1px solid #28283F", borderRadius: 18, overflow: "hidden" }}>
            {d.stats.map((s) => (
              <div key={s.label} style={{ padding: "16px 18px", background: "#151527" }}>
                <div style={{ fontSize: 12.5, color: "#6B6889" }}>{s.label}</div>
                <div style={{ marginTop: 5, fontFamily: "'Clash Display', sans-serif", fontSize: 20, fontWeight: 500, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={landing.corner} style={{ padding: 30, background: "#151527", border: "1px solid #28283F", borderRadius: 32 }}>
          <h2 style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 500, fontSize: 22, letterSpacing: "-0.02em", margin: "0 0 20px" }}>Market spec</h2>
          <div className={landing.corner} style={{ display: "grid", gap: 1, background: "#28283F", border: "1px solid #28283F", borderRadius: 20, overflow: "hidden" }}>
            {d.spec.map((row) => (
              <div key={row.label} style={{ display: "grid", gridTemplateColumns: "200px minmax(0,1fr)", gap: 20, alignItems: "center", padding: "15px 20px", background: "#0A0A16" }}>
                <span style={{ fontSize: 13.5, color: "#6B6889" }}>{row.label}</span>
                <span style={{ fontFamily: row.font, fontSize: 14.5, color: "#F5F4FB", overflowWrap: "anywhere" }}>{row.value}</span>
              </div>
            ))}
          </div>
          <p style={{ margin: "18px 0 0", fontSize: 13.5, color: "#6B6889" }}>
            The spec is immutable once the market opens. Cascade replays the event log at the deadline block and settles from the proof {EM_DASH} no reviewer, no override.
          </p>
        </div>

        <div className={landing.corner} style={{ padding: 30, background: "#151527", border: "1px solid #28283F", borderRadius: 32 }}>
          <h2 style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 500, fontSize: 22, letterSpacing: "-0.02em", margin: "0 0 24px" }}>Resolution</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {d.steps.map((st, i) => (
              <div key={st.title} style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr)", gap: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div className={landing.corner} style={{ width: 26, height: 26, flex: "none", borderRadius: 9, display: "grid", placeItems: "center", background: st.dotBg, border: `1px solid ${st.dotBorder}` }}>
                    <div className={landing.corner} style={{ width: 8, height: 8, borderRadius: 3, background: st.dot }} />
                  </div>
                  <div style={{ width: 1, flex: 1, background: "#28283F", minHeight: st.railHeight }} />
                </div>
                <div style={{ paddingBottom: 22 }}>
                  <div style={{ fontSize: 16, fontWeight: 500, color: st.titleColor }}>{st.title}</div>
                  <div style={{ marginTop: 4, fontSize: 13.5, color: "#6B6889", fontVariantNumeric: "tabular-nums" }}>{st.meta}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={landing.corner} style={{ padding: 30, background: "#151527", border: "1px solid #28283F", borderRadius: 32 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
            <h2 style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 500, fontSize: 22, letterSpacing: "-0.02em", margin: 0 }}>Pool</h2>
            <span style={{ fontSize: 13, color: "#6B6889" }}>{d.traderLine}</span>
          </div>
          {v.hasChain ? (
            <div className={landing.corner} style={{ display: "grid", gap: 1, background: "#28283F", border: "1px solid #28283F", borderRadius: 20, overflow: "hidden" }}>
              {[
                ["Total pool", `${d.stats[0]!.value}`],
                ["Yes stake", `${formatEther(v.yesPool)} CTC`],
                ["No stake", `${formatEther(v.noPool)} CTC`],
                ["Implied odds", `${v.yesPct}% YES / ${100 - v.yesPct}% NO`],
                ...(v.isCumulative ? [["Progress to threshold", `${v.progressLabel} (${v.progressPct}%)`] as const] : []),
              ].map(([label, value]) => (
                <div key={label} style={{ display: "grid", gridTemplateColumns: "200px minmax(0,1fr)", gap: 20, alignItems: "center", padding: "15px 20px", background: "#0A0A16" }}>
                  <span style={{ fontSize: 13.5, color: "#6B6889" }}>{label}</span>
                  <span style={{ fontFamily: SANS, fontSize: 14.5, color: "#F5F4FB", fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 13.5, color: "#6B6889" }}>
              Live pool figures load from the contract. Connect to Creditcoin testnet, or the Markets contract isn&apos;t configured.
            </p>
          )}
          <p style={{ margin: "16px 0 0", fontSize: 12.5, color: "#6B6889" }}>
            Per-address positions aren&apos;t indexed yet {EM_DASH} they land once the backend event indexer is wired to this contract.
          </p>
        </div>
      </div>

      <aside style={{ position: "sticky", top: 104, display: "flex", flexDirection: "column", gap: 16 }}>
        <div className={landing.corner} style={{ padding: 26, background: "#151527", border: "1px solid #28283F", borderRadius: 32 }}>
          {v.statusKey === "open" && !v.deadlinePassed ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <h2 style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 500, fontSize: 21, letterSpacing: "-0.02em", margin: 0 }}>Take a position</h2>
                <span style={{ fontSize: 13, color: "#6B6889" }}>{d.timeLeftLabel}</span>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                {sides.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSide(s.key)}
                    className={`${landing.corner} ${styles.sideBtn}`}
                    style={{
                      flex: 1,
                      fontFamily: "'General Sans', sans-serif",
                      fontSize: 15,
                      fontWeight: 500,
                      padding: "14px 10px",
                      borderRadius: 16,
                      cursor: "pointer",
                      transition: "background 200ms ease-out, border-color 200ms ease-out",
                      color: s.fg,
                      background: s.bg,
                      border: `1px solid ${s.border}`,
                    }}
                  >
                    <div>{s.label}</div>
                    <div style={{ marginTop: 3, fontSize: 13, opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>{s.price}</div>
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6B6889" }}>Stake</label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <input
                    value={stake}
                    onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))}
                    inputMode="decimal"
                    placeholder="10"
                    className={`${landing.corner} ${marketsStyles.field}`}
                    style={{ width: "100%", fontFamily: "'General Sans', sans-serif", fontSize: 17, fontVariantNumeric: "tabular-nums", color: "#F5F4FB", background: "#0A0A16", border: "1px solid #28283F", borderRadius: 16, padding: "15px 62px 15px 16px" }}
                  />
                  <span style={{ position: "absolute", right: 16, fontSize: 13.5, color: "#6B6889" }}>CTC</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[5, 10, 25, 50].map((v) => (
                    <button
                      key={v}
                      onClick={() => setStake(String(v))}
                      className={`${landing.corner} ${styles.presetBtn}`}
                      style={{ flex: 1, fontFamily: "'General Sans', sans-serif", fontSize: 13.5, fontWeight: 500, color: "#A5A3BE", background: "#1E1E36", border: "1px solid #28283F", padding: "9px 0", borderRadius: 12, cursor: "pointer" }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div className={landing.corner} style={{ display: "flex", flexDirection: "column", gap: 11, padding: 18, background: "#0A0A16", border: "1px solid #28283F", borderRadius: 20, fontSize: 14 }}>
                {quote.map((q) => (
                  <div key={q.label} style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
                    <span style={{ color: "#6B6889" }}>{q.label}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", color: q.color }}>{q.value}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={placeBet}
                disabled={betPending}
                className={`${landing.corner} ${styles.ctaBtn}`}
                style={{ fontFamily: "'General Sans', sans-serif", fontSize: 16, fontWeight: 500, color: "#0A0A16", background: ctaBg, border: "none", padding: 16, borderRadius: 16, cursor: betPending ? "wait" : "pointer", opacity: betPending ? 0.7 : 1 }}
              >
                {betPending ? "Confirming…" : ctaLabel}
              </button>
              {betError ? (
                <p style={{ margin: 0, fontSize: 12.5, color: "#FF5C7A", textAlign: "center", overflowWrap: "anywhere" }}>{betError}</p>
              ) : betTxHash ? (
                <p style={{ margin: 0, fontSize: 12.5, color: "#3DDC97", textAlign: "center" }}>
                  Bet placed {EM_DASH}{" "}
                  <a
                    href={`${creditcoinTestnet.blockExplorers?.default.url ?? ""}/tx/${betTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#3DDC97", textDecoration: "underline" }}
                  >
                    view transaction
                  </a>
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 12.5, color: "#6B6889", textAlign: "center" }}>Positions lock the moment the proof is submitted.</p>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h2 style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 500, fontSize: 21, letterSpacing: "-0.02em", margin: 0 }}>{d.lockedTitle}</h2>
              <p style={{ margin: 0, fontSize: 14.5, color: "#A5A3BE" }}>{d.lockedBody}</p>
              <div className={landing.corner} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", background: "#0A0A16", border: "1px solid #28283F", borderRadius: 16, fontSize: 14 }}>
                <span style={{ color: "#6B6889" }}>Pool</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{v.hasChain ? `${v.poolLabel} CTC` : EM_DASH}</span>
              </div>
              <Link
                href="/markets"
                style={{ fontFamily: "'General Sans', sans-serif", fontSize: 15, fontWeight: 500, color: "#F5F4FB", background: "#1E1E36", border: "1px solid #28283F", padding: 14, borderRadius: 16, textAlign: "center" }}
                className={landing.corner}
              >
                Browse open markets
              </Link>
            </div>
          )}
        </div>

        <div className={landing.corner} style={{ padding: "22px 26px", background: "#151527", border: "1px solid #28283F", borderRadius: 28 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6B6889" }}>Watching</div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: "#6B6889" }}>Contract</span>
              <span className={styles.contractLink} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 }}>
                {d.contractShort}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: "#6B6889" }}>Event</span>
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 }}>{d.eventName}</span>
            </div>
            {d.isCumulative && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ color: "#6B6889" }}>Running total</span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: "#2FE6D9" }}>{d.runningTotalLabel}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: "#6B6889" }}>Deadline</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{v.deadlineLabel}</span>
            </div>
          </div>
          <div className={landing.corner} style={{ marginTop: 16, display: "flex", height: 8, borderRadius: 6, overflow: "hidden", background: "#0A0A16" }}>
            <div style={{ background: "linear-gradient(90deg,#7C5CFF,#2FE6D9)", transition: "width 700ms ease-out", width: `${d.progressPct}%` }} />
          </div>
          <div style={{ marginTop: 9, fontSize: 12.5, color: "#6B6889", fontVariantNumeric: "tabular-nums" }}>{d.progressLine}</div>
        </div>
      </aside>
    </div>
  );
}
