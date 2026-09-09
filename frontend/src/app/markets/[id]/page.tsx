"use client";

import { use, useState } from "react";
import Link from "next/link";
import { parseEther } from "viem";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import landing from "../../page.module.css";
import marketsStyles from "../page.module.css";
import styles from "./page.module.css";
import { MARKETS, ABI_EVENTS, type Market } from "@/lib/cascade-data";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { creditcoinTestnet } from "@/config/web3";
import { DEFAULT_MARKET_ID, MARKETS_CONTRACT_ADDRESS, marketsAbi } from "@/lib/contracts/markets";

const EM_DASH = "—";

function hash01(seed: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function pseudoAddress(seed: number, salt: number): string {
  const chars = "0123456789abcdef";
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    out += chars[Math.floor(hash01(seed, salt * 97 + i + 1) * 16)];
  }
  return out;
}

function shortAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function deriveDetail(m: Market) {
  const isCumulative = (m.kind ?? "cumulative") === "cumulative";
  const typeLabel = isCumulative ? "Cumulative" : "One-off";
  const abi = ABI_EVENTS[m.id % ABI_EVENTS.length];
  const metricInput = abi.inputs[0];
  const unit = metricInput ? metricInput[2] : "";

  const ruleLine = m.rule || `Settles from the verified event log at block ${m.block.toLocaleString("en-US")}`;

  const statusLabel =
    m.status === "open" ? "Open" : m.status === "verifying" ? "Verifying" : m.outcome === "yes" ? "Resolved yes" : "Resolved no";
  const statusColor = m.status === "open" ? "#3DDC97" : m.status === "verifying" ? "#2FE6D9" : "#A5A3BE";
  const statusPulsing = m.status === "verifying";

  const volume = m.pool * 3.1;
  const traders = Math.max(8, Math.round(m.pool * 5.2));
  const emissions = Math.max(3, Math.round(m.pool * 0.9) + Math.floor(hash01(m.id, 9) * 18));
  const runningVal = Math.round((m.pool + emissions) * 10) / 10;
  const targetVal = Math.max(1, Math.round(m.pool * 2));

  const blocksBuffer = 1500 + Math.floor(hash01(m.id, 7) * 6000);
  const currentBlock = m.status === "resolved" ? m.block : Math.max(0, m.block - blocksBuffer);
  const openedBlock = Math.max(0, currentBlock - (3000 + Math.floor(hash01(m.id, 3) * 9000)));
  const blocksLeft = Math.max(0, m.block - currentBlock);

  const threshold = isCumulative ? `${targetVal}${unit ? " " + unit : ""}` : EM_DASH;
  const condition = isCumulative ? "Rises above" : EM_DASH;
  const contract = m.contract || pseudoAddress(m.id, 999);
  const shortName = m.question.replace(/^Will |^Did /, "").replace(/\?$/, "");

  const spec = [
    { label: "Market name", value: shortName, font: "'General Sans', sans-serif" },
    {
      label: "Market type",
      value: isCumulative
        ? "Cumulative — emissions add up until the deadline block"
        : "One-off — first matching emission settles it",
      font: "'General Sans', sans-serif",
    },
    { label: "Contract address", value: contract, font: "ui-monospace, Menlo, monospace" },
    { label: "Event ABI", value: abi.signature, font: "ui-monospace, Menlo, monospace" },
    { label: "Tracked metric", value: metricInput ? `${metricInput[0]} ${EM_DASH} ${metricInput[1]}` : EM_DASH, font: "ui-monospace, Menlo, monospace" },
    { label: "Condition", value: condition, font: "'General Sans', sans-serif" },
    { label: "Threshold", value: threshold, font: "'General Sans', sans-serif" },
    { label: "Deadline block", value: `${m.block.toLocaleString("en-US")} · Ethereum Sepolia`, font: "'General Sans', sans-serif" },
  ];

  const stepReached = m.status === "resolved" ? 4 : m.status === "verifying" ? 2 : 1;
  const stepDefs: [string, string][] = [
    ["Market opened", `Block ${openedBlock.toLocaleString("en-US")} · spec locked`],
    ["Watching emissions", `${emissions} ${abi.name} events indexed · ${runningVal.toFixed(1)} ${unit || "units"} counted`],
    ["Deadline block", `Block ${m.block.toLocaleString("en-US")} · positions lock here`],
    ["Proof verified, payouts released", m.status === "resolved" ? "Settled from the event log" : "Pending"],
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

  const positions = Array.from({ length: 6 }).map((_, i) => {
    const addr = pseudoAddress(m.id, i + 1);
    const isYes = hash01(m.id, i + 50) < m.yes / 100;
    const size = (2 + hash01(m.id, i + 80) * 12).toFixed(1);
    const blockOffset = Math.round(hash01(m.id, i + 120) * 400) + i * 60;
    return {
      address: shortAddr(addr),
      side: isYes ? "Yes" : "No",
      size: `${size} CTC`,
      block: Math.max(0, currentBlock - blockOffset).toLocaleString("en-US"),
      sideColor: isYes ? "#3DDC97" : "#FF5C7A",
    };
  });

  const progressPct = !isCumulative
    ? m.status === "resolved"
      ? 100
      : 35
    : m.status === "resolved"
      ? 100
      : Math.min(96, Math.round((runningVal / targetVal) * 100));
  const progressLine = !isCumulative
    ? m.status === "resolved"
      ? `Matching emission recorded at block ${currentBlock.toLocaleString("en-US")}`
      : `Watching for a matching ${abi.name} emission before block ${m.block.toLocaleString("en-US")}`
    : m.status === "resolved"
      ? `Threshold crossed at block ${currentBlock.toLocaleString("en-US")} ${EM_DASH} market stays open until the deadline`
      : `${Math.max(0, targetVal - runningVal).toFixed(1)} ${unit || "units"} to go ${EM_DASH} last emission at block ${currentBlock.toLocaleString("en-US")}`;

  const mockStake = 12;
  const winSidePct = m.outcome === "yes" ? m.yes : 100 - m.yes;
  const mockPayout = winSidePct > 0 ? ((mockStake * 100) / winSidePct).toFixed(1) : "0.0";
  const lockedTitle = m.status === "verifying" ? "Positions locked" : m.outcome === "yes" ? "Market resolved yes" : "Market resolved no";
  const lockedBody =
    m.status === "verifying"
      ? "The proof is submitted and verifying on-chain. Nothing can be added or withdrawn until it settles."
      : `The event log settled ${m.outcome} at block ${m.block.toLocaleString("en-US")}. Payouts were released to ${m.outcome} positions in the same transaction.`;
  const lockedPosition = m.status === "resolved" ? `${mockStake.toFixed(1)} CTC ${m.outcome} ${EM_DASH} ${mockPayout} CTC paid` : `${mockStake.toFixed(1)} CTC yes`;

  return {
    typeLabel,
    ruleLine,
    statusLabel,
    statusColor,
    statusPulsing,
    isCumulative,
    stats: [
      { label: "Pool", value: `${m.pool.toFixed(1)} CTC` },
      { label: "Volume", value: `${volume.toFixed(1)} CTC` },
      { label: "Traders", value: String(traders) },
      { label: "Blocks left", value: blocksLeft.toLocaleString("en-US") },
    ],
    spec,
    steps,
    positions,
    traderLine: `${traders} addresses in this market`,
    contract,
    contractShort: shortAddr(contract),
    eventName: `${abi.name}()`,
    emissionsLabel: `${emissions} events`,
    runningTotalLabel: `${runningVal.toFixed(1)} / ${targetVal} ${unit || "units"}`,
    progressPct,
    progressLine,
    blocksLeft,
    lockedTitle,
    lockedBody,
    lockedPosition,
  };
}

export default function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const market = MARKETS.find((m) => m.id === Number(id)) ?? null;

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
          <span style={{ color: "#A5A3BE" }}>{market ? `CSC-${String(market.id).padStart(4, "0")}` : id}</span>
        </div>

        {!market ? (
          <div className={landing.corner} style={{ marginTop: 22, padding: "64px 40px", textAlign: "center", background: "#151527", border: "1px solid #28283F", borderRadius: 32 }}>
            <h1 style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 500, fontSize: 28, letterSpacing: "-0.02em", margin: 0 }}>
              Market not found
            </h1>
            <p style={{ margin: "12px auto 26px", color: "#A5A3BE", maxWidth: "52ch" }}>
              This market doesn&apos;t exist, or it was created locally and isn&apos;t available on this page yet.
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
          <MarketDetail market={market} />
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

function MarketDetail({ market: m }: { market: Market }) {
  const d = deriveDetail(m);
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [stake, setStake] = useState("10");

  // ── On-chain bet wiring ──────────────────────────────────────────────────
  // The UI still lists mock markets, so every bet is placed against one real
  // deployed market (DEFAULT_MARKET_ID) for now. See lib/contracts/markets.ts.
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
    setBetPending(true);
    try {
      if (chainId !== creditcoinTestnet.id) {
        await switchChainAsync({ chainId: creditcoinTestnet.id });
      }
      const hash = await writeContractAsync({
        address: MARKETS_CONTRACT_ADDRESS,
        abi: marketsAbi,
        functionName: "bet",
        args: [DEFAULT_MARKET_ID, side === "yes"],
        value,
      });
      setBetTxHash(hash);
      await publicClient?.waitForTransactionReceipt({ hash });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transaction failed";
      setBetError(message.length > 200 ? message.slice(0, 200) + "…" : message);
    } finally {
      setBetPending(false);
    }
  }

  const no = 100 - m.yes;
  const price = (side === "yes" ? m.yes : no) / 100;
  const stakeNum = Math.max(0, parseFloat(stake) || 0);
  const shares = price > 0 ? stakeNum / price : 0;
  const profit = shares - stakeNum;
  const roi = stakeNum > 0 ? (profit / stakeNum) * 100 : 0;

  const sides = (
    [
      ["yes", "Yes", m.yes],
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
              {m.deadline}
            </span>
          </div>

          <h1 style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 600, fontSize: 42, lineHeight: 1.08, letterSpacing: "-0.035em", margin: 0 }}>{m.question}</h1>
          <p style={{ margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13.5, color: "#6B6889" }}>{d.ruleLine}</p>

          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, marginTop: 6 }}>
            <div>
              <div style={{ fontSize: 13, color: "#6B6889" }}>Yes</div>
              <div style={{ fontFamily: "'Clash Display', sans-serif", fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1, color: "#3DDC97", fontVariantNumeric: "tabular-nums" }}>{m.yes}%</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, color: "#6B6889" }}>No</div>
              <div style={{ fontFamily: "'Clash Display', sans-serif", fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1, color: "#FF5C7A", fontVariantNumeric: "tabular-nums" }}>{no}%</div>
            </div>
          </div>
          <div className={landing.corner} style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", background: "#0A0A16" }}>
            <div style={{ background: "#3DDC97", transition: "width 700ms ease-out", width: `${m.yes}%` }} />
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
            <h2 style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 500, fontSize: 22, letterSpacing: "-0.02em", margin: 0 }}>Positions</h2>
            <span style={{ fontSize: 13, color: "#6B6889" }}>{d.traderLine}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) .7fr .8fr .9fr", gap: 12, padding: "0 4px 12px", fontSize: 12.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6B6889", borderBottom: "1px solid #28283F" }}>
            <span>Address</span>
            <span>Side</span>
            <span style={{ textAlign: "right" }}>Size</span>
            <span style={{ textAlign: "right" }}>Block</span>
          </div>
          {d.positions.map((p, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) .7fr .8fr .9fr", gap: 12, padding: "14px 4px", borderBottom: "1px solid #1E1E36", fontSize: 14.5, alignItems: "center" }}>
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13.5, color: "#A5A3BE" }}>{p.address}</span>
              <span style={{ fontWeight: 500, color: p.sideColor }}>{p.side}</span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.size}</span>
              <span style={{ textAlign: "right", color: "#6B6889", fontVariantNumeric: "tabular-nums" }}>{p.block}</span>
            </div>
          ))}
        </div>
      </div>

      <aside style={{ position: "sticky", top: 104, display: "flex", flexDirection: "column", gap: 16 }}>
        <div className={landing.corner} style={{ padding: 26, background: "#151527", border: "1px solid #28283F", borderRadius: 32 }}>
          {m.status === "open" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <h2 style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 500, fontSize: 21, letterSpacing: "-0.02em", margin: 0 }}>Take a position</h2>
                <span style={{ fontSize: 13, color: "#6B6889" }}>{d.blocksLeft.toLocaleString("en-US")} blocks left</span>
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
                <span style={{ color: "#6B6889" }}>Your position</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{d.lockedPosition}</span>
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
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: "#6B6889" }}>Emissions so far</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{d.emissionsLabel}</span>
            </div>
            {d.isCumulative && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ color: "#6B6889" }}>Running total</span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: "#2FE6D9" }}>{d.runningTotalLabel}</span>
              </div>
            )}
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
