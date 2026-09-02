"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import landing from "../page.module.css";
import styles from "./page.module.css";
import { MARKETS, ABI_EVENTS, type Market, type MarketStatus, type AbiEvent } from "@/lib/cascade-data";

const EM_DASH = "—";

type Condition = [value: string, label: string, lower: string, verb: string];

const CONDITIONS: Condition[] = [
  ["gt", "Rises above", "rises above", "rise above"],
  ["gte", "Reaches at least", "reaches at least", "reach at least"],
  ["lt", "Falls below", "falls below", "fall below"],
  ["lte", "Stays at or under", "stays at or under", "stay at or under"],
  ["eq", "Equals exactly", "equals exactly", "equal"],
];

const TAB_DEFS: [MarketStatus | "all", string][] = [
  ["open", "Open"],
  ["verifying", "Verifying"],
  ["resolved", "Resolved"],
  ["all", "All"],
];

const TYPE_DEFS: [string, string, string][] = [
  ["cumulative", "Cumulative", "Adds every emission up and settles against a threshold."],
  ["oneoff", "One-off", "Settles yes or no on a single matching emission."],
];

type Filter = MarketStatus | "all";
type SortKey = "pool" | "deadline" | "split";

function decorate(m: Market) {
  const statusLabel =
    m.status === "open" ? (m.contract ? "Open · yours" : "Open") : m.status === "verifying" ? "Verifying" : "Resolved";
  const statusColor = m.status === "open" ? "#3DDC97" : m.status === "verifying" ? "#2FE6D9" : "#A5A3BE";
  return {
    ...m,
    statusLabel,
    statusColor,
    pulsing: m.status === "verifying",
    yesWidth: `${m.yes}%`,
    noWidth: `${100 - m.yes}%`,
    poolLabel: m.pool.toFixed(1),
    isOpen: m.status === "open",
    isVerifying: m.status === "verifying",
    isResolved: m.status === "resolved",
    outcomeLabel: m.outcome === "yes" ? "Resolved yes" : "Resolved no",
    outcomeColor: m.outcome === "yes" ? "#3DDC97" : "#FF5C7A",
    payoutLine: m.payout || "",
  };
}

export default function MarketsPage() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let raf: number | null = null;
    let scroller: HTMLElement = (document.scrollingElement || document.documentElement) as HTMLElement;

    const collectScroller = () => {
      const root = rootRef.current;
      if (!root) return;
      let n: HTMLElement | null = root.parentElement;
      scroller = (document.scrollingElement || document.documentElement) as HTMLElement;
      while (n && n !== document.body) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 4) {
          scroller = n;
          break;
        }
        n = n.parentElement;
      }
    };

    const tick = () => {
      raf = null;
      const bar = barRef.current;
      if (!bar) return;
      const isRoot = scroller === (document.scrollingElement || document.documentElement);
      const top = isRoot ? window.scrollY || scroller.scrollTop || 0 : scroller.scrollTop;
      const max = Math.max(1, (scroller.scrollHeight || 1) - (scroller.clientHeight || window.innerHeight));
      const p = Math.min(1, Math.max(0, top / max));
      bar.style.transform = `scaleX(${p})`;
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);

    collectScroller();
    onScroll();
    const timers = [120, 600].map((ms) =>
      setTimeout(() => {
        collectScroller();
        onScroll();
      }, ms)
    );

    return () => {
      timers.forEach(clearTimeout);
      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("pool");
  const [created, setCreated] = useState<Market[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"cumulative" | "oneoff">("cumulative");
  const [address, setAddress] = useState("");
  const [abiState, setAbiState] = useState<"idle" | "loading" | "invalid" | "ready">("idle");
  const [manualAbi, setManualAbi] = useState("");
  const [eventName, setEventName] = useState("");
  const [metric, setMetric] = useState("");
  const [condition, setCondition] = useState("gt");
  const [threshold, setThreshold] = useState("");
  const [oneOffSide, setOneOffSide] = useState<"emitted" | "absent">("emitted");
  const [deadlineBlock, setDeadlineBlock] = useState("");

  const abiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (abiTimerRef.current) clearTimeout(abiTimerRef.current);
    };
  }, []);

  const currentEvent = useMemo(() => ABI_EVENTS.find((e) => e.name === eventName) || null, [eventName]);

  const openCreate = () => setModalOpen(true);

  const closeCreate = () => {
    if (abiTimerRef.current) clearTimeout(abiTimerRef.current);
    setModalOpen(false);
    setName("");
    setAddress("");
    setAbiState("idle");
    setManualAbi("");
    setEventName("");
    setMetric("");
    setCondition("gt");
    setThreshold("");
    setDeadlineBlock("");
  };

  const onAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const addr = e.target.value.trim();
    const valid = /^0x[a-fA-F0-9]{40}$/.test(addr);
    if (abiTimerRef.current) clearTimeout(abiTimerRef.current);
    setAddress(addr);
    setEventName("");
    setMetric("");
    setAbiState(valid ? "loading" : addr ? "invalid" : "idle");
    if (valid) {
      abiTimerRef.current = setTimeout(() => setAbiState("ready"), 1100);
    }
  };

  const chooseEvent = (ev: AbiEvent) => {
    setEventName(ev.name);
    setMetric(ev.inputs.length ? ev.inputs[0][0] : "");
    if (!ev.inputs.length) setType("oneoff");
  };

  const buildQuestion = (): string => {
    const ev = currentEvent;
    if (!ev) return "";
    const short = address.slice(0, 5) + "…" + address.slice(-3);
    if (type === "oneoff") {
      return oneOffSide === "emitted"
        ? `Will ${short} emit ${ev.name} before the deadline block?`
        : `Will ${short} go the whole window without emitting ${ev.name}?`;
    }
    const verb = (CONDITIONS.find((c) => c[0] === condition) || CONDITIONS[0])[3];
    const row = ev.inputs.find((i) => i[0] === metric) || ev.inputs[0];
    const unit = row && row[2] ? " " + row[2] : "";
    return `Will cumulative ${metric || "value"} on ${short} ${verb} ${threshold || EM_DASH}${unit}?`;
  };

  const submitCreate = () => {
    const ev = currentEvent;
    if (!ev) return;
    const block = parseInt(deadlineBlock, 10) || 9481200;
    const rule =
      type === "oneoff"
        ? `${ev.name} emitted ${EM_DASH} ${oneOffSide === "emitted" ? "YES" : "NO"}`
        : `sum(${ev.name}.${metric}) ${condition} ${threshold}`;
    const market: Market = {
      id: 1000 + created.length,
      question: name.trim() || buildQuestion(),
      deadline: "Resolves at block " + block.toLocaleString("en-US"),
      block,
      yes: 50,
      pool: 0,
      status: "open",
      kind: type,
      rule,
      contract: address,
    };
    setCreated((c) => [market, ...c]);
    setFilter("open");
    setQuery("");
    closeCreate();
  };

  const q = query.trim().toLowerCase();
  const matches = (m: Market) =>
    (filter === "all" || m.status === filter) &&
    (!q || (m.question + " " + (m.contract || "")).toLowerCase().includes(q));
  const cmp =
    sort === "pool"
      ? (a: Market, b: Market) => b.pool - a.pool
      : sort === "deadline"
        ? (a: Market, b: Market) => a.block - b.block
        : (a: Market, b: Market) => Math.abs(50 - a.yes) - Math.abs(50 - b.yes);

  const mine = created.filter(matches);
  const list = [...mine, ...MARKETS.filter(matches).slice().sort(cmp)];

  const all = [...created, ...MARKETS];
  const openCount = all.filter((m) => m.status === "open").length;
  const totalPool = all.filter((m) => m.status !== "resolved").reduce((s, m) => s + m.pool, 0);
  const countLine = `${list.length}${list.length === 1 ? " market" : " markets"} shown ${EM_DASH} ${openCount} open right now, ${totalPool.toFixed(1)} CTC in live pools`;

  const abiReady = abiState === "ready";
  const isCumulative = type === "cumulative" && !!currentEvent && currentEvent.inputs.length > 0;
  const isOneOff = !isCumulative && !!currentEvent;
  const metricRow = currentEvent ? currentEvent.inputs.find((i) => i[0] === metric) || currentEvent.inputs[0] : null;
  const complete = !!currentEvent && (isOneOff || (threshold.trim() !== "" && !isNaN(parseFloat(threshold))));
  const showManual = abiState === "invalid" && address.length > 6;

  return (
    <div
      ref={rootRef}
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
        <div
          ref={barRef}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: -1,
            height: 2,
            background: "linear-gradient(90deg,#7C5CFF,#2FE6D9)",
            transformOrigin: "0 50%",
            transform: "scaleX(0)",
          }}
        />
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12, color: "#F5F4FB" }}>
          <div
            className={landing.corner}
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              background: "linear-gradient(135deg,#7C5CFF,#2FE6D9)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <div className={landing.corner} style={{ width: 11, height: 11, borderRadius: 4, background: "#0A0A16" }} />
          </div>
          <span style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 600, fontSize: 21, letterSpacing: "-0.02em" }}>
            Cascade
          </span>
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
        <button
          className={`${landing.corner} ${landing.btnPrimary}`}
          style={{
            fontFamily: "'General Sans', sans-serif",
            fontSize: 15,
            fontWeight: 500,
            color: "#0A0A16",
            background: "#7C5CFF",
            border: "none",
            padding: "11px 20px",
            borderRadius: 14,
            cursor: "pointer",
          }}
        >
          Connect wallet
        </button>
      </header>

      <main style={{ maxWidth: 1440, margin: "0 auto", padding: "56px 48px 96px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
          <div>
            <h1
              style={{
                fontFamily: "'Clash Display', sans-serif",
                fontWeight: 600,
                fontSize: 52,
                lineHeight: 1.05,
                letterSpacing: "-0.035em",
                margin: 0,
              }}
            >
              Markets
            </h1>
            <p style={{ margin: "14px 0 0", color: "#A5A3BE", maxWidth: "64ch" }}>
              Every market here resolves against a single verifiable event on Ethereum Sepolia. The proof settles it{" "}
              {EM_DASH} nobody reviews it afterwards.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              className={landing.corner}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "11px 16px",
                background: "#151527",
                border: "1px solid #28283F",
                borderRadius: 14,
                fontSize: 14,
                color: "#A5A3BE",
              }}
            >
              <span
                className={`${landing.corner} ${landing.livePulse}`}
                style={{ width: 7, height: 7, borderRadius: 3, background: "#FF4FD8" }}
              />
              Watching 1,284 addresses live
            </div>
            <button
              onClick={openCreate}
              className={`${landing.corner} ${landing.btnTeal}`}
              style={{
                fontFamily: "'General Sans', sans-serif",
                fontSize: 15,
                fontWeight: 500,
                color: "#0A0A16",
                background: "#2FE6D9",
                border: "none",
                padding: "12px 20px",
                borderRadius: 14,
                cursor: "pointer",
              }}
            >
              Create a market
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
            margin: "36px 0 12px",
            paddingBottom: 20,
            borderBottom: "1px solid #28283F",
          }}
        >
          <div className={landing.corner} style={{ display: "flex", gap: 8, padding: 6, background: "#151527", border: "1px solid #28283F", borderRadius: 16 }}>
            {TAB_DEFS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={landing.corner}
                style={{
                  fontFamily: "'General Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  border: "none",
                  padding: "9px 16px",
                  borderRadius: 12,
                  cursor: "pointer",
                  transition: "background 200ms ease-out, color 200ms ease-out",
                  background: filter === key ? "#7C5CFF" : "transparent",
                  color: filter === key ? "#0A0A16" : "#A5A3BE",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by address, contract or question"
              className={`${landing.corner} ${styles.field}`}
              style={{
                fontFamily: "'General Sans', sans-serif",
                fontSize: 15,
                color: "#F5F4FB",
                background: "#151527",
                border: "1px solid #28283F",
                borderRadius: 14,
                padding: "12px 16px",
                width: 320,
              }}
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className={`${landing.corner} ${styles.field}`}
              style={{
                fontFamily: "'General Sans', sans-serif",
                fontSize: 15,
                color: "#F5F4FB",
                background: "#151527",
                border: "1px solid #28283F",
                borderRadius: 14,
                padding: "12px 16px",
                cursor: "pointer",
              }}
            >
              <option value="pool">Largest pool</option>
              <option value="deadline">Closest deadline</option>
              <option value="split">Tightest split</option>
            </select>
          </div>
        </div>

        <p style={{ margin: "0 0 24px", fontSize: 14, color: "#6B6889", fontVariantNumeric: "tabular-nums" }}>{countLine}</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 }}>
          {list.map((raw) => {
            const m = decorate(raw);
            return (
              <article
                key={m.id}
                className={landing.corner}
                style={{ display: "flex", flexDirection: "column", gap: 18, padding: 24, background: "#151527", border: "1px solid #28283F", borderRadius: 28 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontSize: 13, color: "#6B6889" }}>
                  <span>{m.deadline}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: m.statusColor }}>
                    <span
                      className={`${landing.corner} ${m.pulsing ? landing.provingPulse : ""}`}
                      style={{ width: 7, height: 7, borderRadius: 3, background: m.statusColor }}
                    />
                    {m.statusLabel}
                  </span>
                </div>

                <h2 style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 500, fontSize: 22, lineHeight: 1.2, letterSpacing: "-0.02em", margin: 0 }}>
                  <Link href={`/markets/${m.id}`} style={{ color: "#F5F4FB" }} className={styles.questionLink}>
                    {m.question}
                  </Link>
                </h2>

                <div className={landing.corner} style={{ display: "flex", height: 8, borderRadius: 6, overflow: "hidden", background: "#0A0A16" }}>
                  <div style={{ background: "#3DDC97", transition: "width 700ms ease-out", width: m.yesWidth }} />
                  <div style={{ flex: 1, background: "#FF5C7A" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#A5A3BE" }}>
                  <span style={{ color: "#3DDC97", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>Yes {m.yesWidth}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>Pool {m.poolLabel} CTC</span>
                  <span style={{ color: "#FF5C7A", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>No {m.noWidth}</span>
                </div>

                {m.isOpen && (
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      className={`${landing.corner} ${landing.btnYes}`}
                      style={{ flex: 1, fontFamily: "'General Sans', sans-serif", fontSize: 15, fontWeight: 500, color: "#3DDC97", background: "rgba(61,220,151,.1)", border: "1px solid rgba(61,220,151,.28)", padding: 11, borderRadius: 14, cursor: "pointer" }}
                    >
                      Yes
                    </button>
                    <button
                      className={`${landing.corner} ${landing.btnNo}`}
                      style={{ flex: 1, fontFamily: "'General Sans', sans-serif", fontSize: 15, fontWeight: 500, color: "#FF5C7A", background: "rgba(255,92,122,.1)", border: "1px solid rgba(255,92,122,.28)", padding: 11, borderRadius: 14, cursor: "pointer" }}
                    >
                      No
                    </button>
                  </div>
                )}

                {m.isVerifying && (
                  <div
                    className={landing.corner}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", background: "#0A0A16", border: "1px solid #28283F", borderRadius: 14, fontSize: 14, color: "#A5A3BE" }}
                  >
                    <span>Proof submitted, verifying on-chain</span>
                    <span style={{ color: "#2FE6D9" }}>Positions locked</span>
                  </div>
                )}

                {m.isResolved && (
                  <div style={{ display: "flex", alignItems: "center", gap: 14, paddingTop: 4 }}>
                    <div
                      className={landing.corner}
                      style={{ width: 40, height: 40, flex: "none", borderRadius: 14, background: "linear-gradient(135deg,#7C5CFF,#2FE6D9)", display: "grid", placeItems: "center" }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A0A16" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12.5 L9.5 18 L20 6.5" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontFamily: "'Clash Display', sans-serif", fontSize: 18, fontWeight: 500, letterSpacing: "-0.02em", color: m.outcomeColor }}>
                        {m.outcomeLabel}
                      </div>
                      <div style={{ fontSize: 13, color: "#6B6889", fontVariantNumeric: "tabular-nums" }}>{m.payoutLine}</div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {list.length === 0 && (
          <div className={landing.corner} style={{ marginTop: 8, padding: "64px 40px", textAlign: "center", background: "#151527", border: "1px solid #28283F", borderRadius: 32 }}>
            <h2 style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 500, fontSize: 28, letterSpacing: "-0.02em", margin: 0 }}>
              No markets match that search
            </h2>
            <p style={{ margin: "12px auto 26px", color: "#A5A3BE", maxWidth: "52ch" }}>
              Try a different address or contract, or open a market on any on-chain event you can point to a block for.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  setFilter("all");
                  setQuery("");
                }}
                className={`${landing.corner} ${styles.ghostOutline}`}
                style={{ fontFamily: "'General Sans', sans-serif", fontSize: 15, fontWeight: 500, color: "#F5F4FB", background: "#1E1E36", border: "1px solid #28283F", padding: "13px 22px", borderRadius: 14, cursor: "pointer" }}
              >
                Clear filters
              </button>
              <button
                onClick={openCreate}
                className={`${landing.corner} ${landing.btnPrimary}`}
                style={{ fontFamily: "'General Sans', sans-serif", fontSize: 15, fontWeight: 500, color: "#0A0A16", background: "#7C5CFF", border: "none", padding: "13px 22px", borderRadius: 14, cursor: "pointer" }}
              >
                Create a market
              </button>
            </div>
          </div>
        )}
      </main>

      <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, flexWrap: "wrap", padding: "28px 48px", borderTop: "1px solid #28283F", fontSize: 14, color: "#6B6889" }}>
        <span>Cascade {EM_DASH} a trustless prediction market for on-chain events</span>
        <div style={{ display: "flex", gap: 28 }}>
          <Link href="/" className={landing.footerLink}>
            Home
          </Link>
          <Link href="/#how" className={landing.footerLink}>
            Docs
          </Link>
          <Link href="/#resolution" className={landing.footerLink}>
            Contracts
          </Link>
        </div>
      </footer>

      {modalOpen && (
        <div
          className={styles.veil}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "48px 24px",
            overflowY: "auto",
            background: "rgba(5,5,12,.72)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div onClick={closeCreate} style={{ position: "absolute", inset: 0 }} />
          <div
            className={`${landing.corner} ${styles.sheet}`}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 720,
              background: "#151527",
              border: "1px solid #28283F",
              borderRadius: 32,
              boxShadow: "0 40px 120px rgba(5,5,12,.7)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, padding: "30px 32px 22px", borderBottom: "1px solid #28283F" }}>
              <div>
                <h2 style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 600, fontSize: 28, lineHeight: 1.1, letterSpacing: "-0.03em", margin: 0 }}>
                  Create a market
                </h2>
                <p style={{ margin: "10px 0 0", fontSize: 15, color: "#A5A3BE", maxWidth: "52ch" }}>
                  Point at a contract event. Cascade reads the ABI, watches the metric, and settles the market from the proof.
                </p>
              </div>
              <button
                onClick={closeCreate}
                aria-label="Close"
                className={`${landing.corner} ${styles.closeBtn}`}
                style={{ flex: "none", width: 38, height: 38, display: "grid", placeItems: "center", color: "#A5A3BE", background: "#1E1E36", border: "1px solid #28283F", borderRadius: 12, cursor: "pointer" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M5 5 L19 19 M19 5 L5 19" />
                </svg>
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 26, padding: "28px 32px 4px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6B6889" }}>
                  Market name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Whale transfer before Friday"
                  className={`${landing.corner} ${styles.field}`}
                  style={{ fontFamily: "'General Sans', sans-serif", fontSize: 15, color: "#F5F4FB", background: "#0A0A16", border: "1px solid #28283F", borderRadius: 16, padding: "14px 16px" }}
                />
                <p style={{ margin: 0, fontSize: 13, color: "#6B6889" }}>
                  Shown on the market card. Leave it blank and Cascade names it from the rule.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6B6889" }}>
                  Market type
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {TYPE_DEFS.map(([key, label, hint]) => (
                    <button
                      key={key}
                      onClick={() => setType(key as "cumulative" | "oneoff")}
                      className={landing.corner}
                      style={{
                        textAlign: "left",
                        fontFamily: "'General Sans', sans-serif",
                        padding: "16px 18px",
                        borderRadius: 18,
                        cursor: "pointer",
                        transition: "border-color 200ms ease-out, background 200ms ease-out",
                        background: type === key ? "rgba(124,92,255,.1)" : "#0A0A16",
                        border: `1px solid ${type === key ? "#7C5CFF" : "#28283F"}`,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 16, fontWeight: 500, color: "#F5F4FB" }}>
                        <span className={landing.corner} style={{ width: 9, height: 9, borderRadius: 4, background: type === key ? "#7C5CFF" : "#3B3B57" }} />
                        {label}
                      </div>
                      <div style={{ marginTop: 7, fontSize: 13.5, lineHeight: 1.45, color: "#A5A3BE" }}>{hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6B6889" }}>
                  Contract address
                </label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <input
                    value={address}
                    onChange={onAddressChange}
                    spellCheck={false}
                    placeholder="0x0000000000000000000000000000000000000000"
                    className={`${landing.corner} ${styles.field}`}
                    style={{
                      width: "100%",
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: 14.5,
                      letterSpacing: "0.01em",
                      color: "#F5F4FB",
                      background: "#0A0A16",
                      border: `1px solid ${abiState === "invalid" ? "#FF5C7A" : abiReady ? "rgba(61,220,151,.4)" : "#28283F"}`,
                      borderRadius: 16,
                      padding: "14px 132px 14px 16px",
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      right: 14,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      fontSize: 13,
                      fontWeight: 500,
                      color: abiReady ? "#3DDC97" : abiState === "invalid" ? "#FF5C7A" : "#2FE6D9",
                    }}
                  >
                    {abiState === "loading" && (
                      <span className={styles.spin} style={{ width: 12, height: 12, border: "2px solid #28283F", borderTopColor: "#2FE6D9", borderRadius: "50%" }} />
                    )}
                    {abiState === "loading" ? "Reading ABI" : abiReady ? "Verified" : abiState === "invalid" ? "Not an address" : ""}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "#6B6889" }}>
                  {abiReady
                    ? `Source verified on Sepolia ${EM_DASH} 4 events found in the ABI.`
                    : abiState === "loading"
                      ? "Fetching the verified source from the explorer…"
                      : abiState === "invalid"
                        ? "A contract address is 42 characters starting with 0x."
                        : "Paste a verified contract and Cascade loads its event ABI for you."}
                </p>
              </div>

              {abiReady && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6B6889" }}>
                      Event ABI
                    </label>
                    <span style={{ fontSize: 13, color: "#6B6889" }}>Loaded from verified source · Sepolia</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {ABI_EVENTS.map((ev) => (
                      <button
                        key={ev.name}
                        onClick={() => chooseEvent(ev)}
                        className={landing.corner}
                        style={{
                          textAlign: "left",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                          fontSize: 13.5,
                          lineHeight: 1.5,
                          color: eventName === ev.name ? "#F5F4FB" : "#A5A3BE",
                          padding: "13px 16px",
                          borderRadius: 14,
                          cursor: "pointer",
                          transition: "border-color 200ms ease-out, background 200ms ease-out",
                          background: eventName === ev.name ? "rgba(47,230,217,.08)" : "#0A0A16",
                          border: `1px solid ${eventName === ev.name ? "#2FE6D9" : "#28283F"}`,
                        }}
                      >
                        {ev.signature}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showManual && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6B6889" }}>
                    Paste event ABI
                  </label>
                  <textarea
                    value={manualAbi}
                    onChange={(e) => setManualAbi(e.target.value)}
                    spellCheck={false}
                    placeholder='[{"type":"event","name":"Transfer","inputs":[…]}]'
                    className={`${landing.corner} ${styles.field}`}
                    style={{
                      minHeight: 104,
                      resize: "vertical",
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: 13.5,
                      lineHeight: 1.6,
                      color: "#F5F4FB",
                      background: "#0A0A16",
                      border: "1px solid #28283F",
                      borderRadius: 16,
                      padding: "14px 16px",
                    }}
                  />
                </div>
              )}

              {!!currentEvent && (
                <div className={landing.corner} style={{ display: "flex", flexDirection: "column", gap: 20, padding: 22, background: "#0A0A16", border: "1px solid #28283F", borderRadius: 22 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6B6889" }}>
                      Tracked metric
                    </label>
                    <select
                      value={metric}
                      onChange={(e) => setMetric(e.target.value)}
                      className={`${landing.corner} ${styles.field}`}
                      style={{ fontFamily: "'General Sans', sans-serif", fontSize: 15, color: "#F5F4FB", background: "#151527", border: "1px solid #28283F", borderRadius: 14, padding: "13px 16px", cursor: "pointer" }}
                    >
                      {currentEvent.inputs.length ? (
                        currentEvent.inputs.map(([n, t]) => (
                          <option key={n} value={n}>
                            {n} — {t}
                          </option>
                        ))
                      ) : (
                        <option value="">This event carries no numeric field</option>
                      )}
                    </select>
                    <p style={{ margin: 0, fontSize: 13, color: "#6B6889" }}>Only fields carried by the selected event can be tracked.</p>
                  </div>

                  {isCumulative && (
                    <div style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr", gap: 14 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6B6889" }}>
                          Condition
                        </label>
                        <select
                          value={condition}
                          onChange={(e) => setCondition(e.target.value)}
                          className={`${landing.corner} ${styles.field}`}
                          style={{ fontFamily: "'General Sans', sans-serif", fontSize: 15, color: "#F5F4FB", background: "#151527", border: "1px solid #28283F", borderRadius: 14, padding: "13px 16px", cursor: "pointer" }}
                        >
                          {CONDITIONS.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6B6889" }}>
                          Threshold
                        </label>
                        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                          <input
                            value={threshold}
                            onChange={(e) => setThreshold(e.target.value)}
                            inputMode="decimal"
                            placeholder="100"
                            className={`${landing.corner} ${styles.field}`}
                            style={{ width: "100%", fontFamily: "'General Sans', sans-serif", fontSize: 15, fontVariantNumeric: "tabular-nums", color: "#F5F4FB", background: "#151527", border: "1px solid #28283F", borderRadius: 14, padding: "13px 64px 13px 16px" }}
                          />
                          <span style={{ position: "absolute", right: 15, fontSize: 13, color: "#6B6889" }}>{metricRow ? metricRow[2] : ""}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {isOneOff && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <label style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6B6889" }}>
                        Resolves YES when
                      </label>
                      <div style={{ display: "flex", gap: 10 }}>
                        {(
                          [
                            ["emitted", "Event is emitted"],
                            ["absent", "Event never fires"],
                          ] as const
                        ).map(([key, label]) => (
                          <button
                            key={key}
                            onClick={() => setOneOffSide(key)}
                            className={landing.corner}
                            style={{
                              flex: 1,
                              fontFamily: "'General Sans', sans-serif",
                              fontSize: 15,
                              fontWeight: 500,
                              padding: 13,
                              borderRadius: 14,
                              cursor: "pointer",
                              transition: "background 200ms ease-out, border-color 200ms ease-out",
                              color: oneOffSide === key ? "#3DDC97" : "#A5A3BE",
                              background: oneOffSide === key ? "rgba(61,220,151,.12)" : "#151527",
                              border: `1px solid ${oneOffSide === key ? "rgba(61,220,151,.45)" : "#28283F"}`,
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "#6B6889" }}>
                        A one-off market settles on the first matching emission before the deadline block.
                      </p>
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6B6889" }}>
                      Deadline block
                    </label>
                    <input
                      value={deadlineBlock}
                      onChange={(e) => setDeadlineBlock(e.target.value.replace(/[^0-9]/g, ""))}
                      inputMode="numeric"
                      placeholder="9481200"
                      className={`${landing.corner} ${styles.field}`}
                      style={{ fontFamily: "'General Sans', sans-serif", fontSize: 15, fontVariantNumeric: "tabular-nums", color: "#F5F4FB", background: "#151527", border: "1px solid #28283F", borderRadius: 14, padding: "13px 16px" }}
                    />
                  </div>
                </div>
              )}

              {complete && (
                <div className={landing.corner} style={{ display: "flex", gap: 14, padding: "18px 20px", background: "rgba(124,92,255,.08)", border: "1px solid rgba(124,92,255,.3)", borderRadius: 20 }}>
                  <div className={landing.corner} style={{ width: 34, height: 34, flex: "none", borderRadius: 12, background: "linear-gradient(135deg,#7C5CFF,#2FE6D9)", display: "grid", placeItems: "center" }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0A0A16" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12.5 L9.5 18 L20 6.5" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#A5A3BE" }}>
                      Market question
                    </div>
                    <div style={{ marginTop: 6, fontFamily: "'Clash Display', sans-serif", fontSize: 19, fontWeight: 500, lineHeight: 1.25, letterSpacing: "-0.02em", color: "#F5F4FB" }}>
                      {name.trim() || buildQuestion()}
                    </div>
                    <div style={{ marginTop: 8, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5, color: "#6B6889" }}>
                      {currentEvent
                        ? isOneOff
                          ? `${currentEvent.name} emitted ${EM_DASH} ${oneOffSide === "emitted" ? "YES" : "NO"}`
                          : `sum(${currentEvent.name}.${metric || "value"}) ${condition} ${threshold || EM_DASH} ${metricRow ? metricRow[2] : ""}`
                        : ""}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginTop: 26, padding: "22px 32px", borderTop: "1px solid #28283F" }}>
              <span style={{ fontSize: 13.5, color: "#6B6889" }}>
                {complete ? `Resolution runs from the proof ${EM_DASH} no reviewer, no override.` : "Fill in the contract and its event to continue."}
              </span>
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  onClick={closeCreate}
                  className={`${landing.corner} ${styles.ghostOutline}`}
                  style={{ fontFamily: "'General Sans', sans-serif", fontSize: 15, fontWeight: 500, color: "#F5F4FB", background: "#1E1E36", border: "1px solid #28283F", padding: "13px 22px", borderRadius: 14, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={submitCreate}
                  disabled={!complete}
                  className={landing.corner}
                  style={{
                    fontFamily: "'General Sans', sans-serif",
                    fontSize: 15,
                    fontWeight: 500,
                    color: complete ? "#0A0A16" : "#6B6889",
                    border: "none",
                    padding: "13px 24px",
                    borderRadius: 14,
                    transition: "background 200ms ease-out, transform 280ms cubic-bezier(0.34,1.56,0.64,1)",
                    background: complete ? "#2FE6D9" : "#1E1E36",
                    cursor: complete ? "pointer" : "not-allowed",
                    opacity: complete ? 1 : 0.55,
                  }}
                >
                  Open market
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
