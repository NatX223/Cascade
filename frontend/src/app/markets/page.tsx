"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import landing from "../page.module.css";
import styles from "./page.module.css";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { CreateMarketModal } from "@/components/CreateMarketModal";
import { useMarketsList } from "@/lib/useMarkets";
import type { MarketStatusKey, MarketView } from "@/lib/market-view";

const EM_DASH = "—";

const TAB_DEFS: [MarketStatusKey | "all", string][] = [
  ["open", "Open"],
  ["resolved", "Resolved"],
  ["cancelled", "Cancelled"],
  ["all", "All"],
];

type Filter = MarketStatusKey | "all";
type SortKey = "pool" | "deadline" | "split";

function decorate(v: MarketView) {
  return {
    id: v.id,
    question: v.question,
    deadline:
      v.statusKey === "open"
        ? v.deadlinePassed
          ? "Awaiting resolution"
          : `Resolves ${v.deadlineLabel}`
        : `Deadline ${v.deadlineLabel}`,
    statusLabel: v.statusLabel,
    statusColor: v.statusColor,
    pulsing: v.statusKey === "open" && v.deadlinePassed,
    yesWidth: `${v.yesPct}%`,
    noWidth: `${100 - v.yesPct}%`,
    poolLabel: v.hasChain ? v.poolLabel : EM_DASH,
    isOpen: v.statusKey === "open",
    isVerifying: false,
    isResolved: v.statusKey === "resolved",
    isCancelled: v.statusKey === "cancelled",
    outcomeLabel: v.outcome === "yes" ? "Resolved yes" : v.outcome === "no" ? "Resolved no" : "Cancelled",
    outcomeColor: v.outcome === "yes" ? "#3DDC97" : v.outcome === "no" ? "#FF5C7A" : "#A5A3BE",
    payoutLine: v.hasChain ? `${v.poolLabel} CTC pool` : "",
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
  const [modalOpen, setModalOpen] = useState(false);

  const openCreate = () => setModalOpen(true);
  const closeCreate = () => setModalOpen(false);

  const { markets, isLoading, isError, error, refetch } = useMarketsList();

  const q = query.trim().toLowerCase();
  const list = useMemo(() => {
    const matches = (v: MarketView) =>
      (filter === "all" || v.statusKey === filter) &&
      (!q ||
        `${v.question} ${v.sourceContract} ${v.watchedAddress ?? ""} ${v.creator}`
          .toLowerCase()
          .includes(q));
    const cmp =
      sort === "pool"
        ? (a: MarketView, b: MarketView) => b.poolCtc - a.poolCtc
        : sort === "deadline"
          ? (a: MarketView, b: MarketView) => a.deadlineSec - b.deadlineSec
          : (a: MarketView, b: MarketView) => Math.abs(50 - a.yesPct) - Math.abs(50 - b.yesPct);
    return markets.filter(matches).sort(cmp);
  }, [markets, filter, q, sort]);

  const openCount = markets.filter((m) => m.statusKey === "open").length;
  const totalPool = markets.reduce((s, m) => s + m.poolCtc, 0);
  const countLine = isLoading
    ? "Loading markets…"
    : `${list.length}${list.length === 1 ? " market" : " markets"} shown ${EM_DASH} ${openCount} open right now, ${totalPool.toFixed(2)} CTC in live pools`;

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
        <ConnectWalletButton size="sm" />
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
              {openCount} open {openCount === 1 ? "market" : "markets"} live
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

        {isLoading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`${landing.corner} ${landing.livePulse}`}
                style={{ height: 220, background: "#151527", border: "1px solid #28283F", borderRadius: 28 }}
              />
            ))}
          </div>
        )}

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
                    <Link
                      href={`/markets/${m.id}`}
                      className={`${landing.corner} ${landing.btnYes}`}
                      style={{ flex: 1, textAlign: "center", fontFamily: "'General Sans', sans-serif", fontSize: 15, fontWeight: 500, color: "#3DDC97", background: "rgba(61,220,151,.1)", border: "1px solid rgba(61,220,151,.28)", padding: 11, borderRadius: 14, cursor: "pointer" }}
                    >
                      Bet Yes
                    </Link>
                    <Link
                      href={`/markets/${m.id}`}
                      className={`${landing.corner} ${landing.btnNo}`}
                      style={{ flex: 1, textAlign: "center", fontFamily: "'General Sans', sans-serif", fontSize: 15, fontWeight: 500, color: "#FF5C7A", background: "rgba(255,92,122,.1)", border: "1px solid rgba(255,92,122,.28)", padding: 11, borderRadius: 14, cursor: "pointer" }}
                    >
                      Bet No
                    </Link>
                  </div>
                )}

                {m.isCancelled && (
                  <div
                    className={landing.corner}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", background: "#0A0A16", border: "1px solid #28283F", borderRadius: 14, fontSize: 14, color: "#A5A3BE" }}
                  >
                    <span>Market cancelled</span>
                    <span style={{ color: "#FF5C7A" }}>Stakes refundable</span>
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

        {isError && (
          <div className={landing.corner} style={{ marginTop: 8, padding: "48px 40px", textAlign: "center", background: "#151527", border: "1px solid rgba(255,92,122,.3)", borderRadius: 32 }}>
            <h2 style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 500, fontSize: 24, letterSpacing: "-0.02em", margin: 0, color: "#FF5C7A" }}>
              Couldn&apos;t load markets
            </h2>
            <p style={{ margin: "12px auto 22px", color: "#A5A3BE", maxWidth: "52ch", overflowWrap: "anywhere" }}>
              {error?.message || "The backend isn't reachable."} Is the Cascade backend running on {process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"}?
            </p>
            <button
              onClick={() => refetch()}
              className={`${landing.corner} ${styles.ghostOutline}`}
              style={{ fontFamily: "'General Sans', sans-serif", fontSize: 15, fontWeight: 500, color: "#F5F4FB", background: "#1E1E36", border: "1px solid #28283F", padding: "13px 22px", borderRadius: 14, cursor: "pointer" }}
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && list.length === 0 && (
          <div className={landing.corner} style={{ marginTop: 8, padding: "64px 40px", textAlign: "center", background: "#151527", border: "1px solid #28283F", borderRadius: 32 }}>
            <h2 style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 500, fontSize: 28, letterSpacing: "-0.02em", margin: 0 }}>
              {markets.length === 0 ? "No markets yet" : "No markets match that search"}
            </h2>
            <p style={{ margin: "12px auto 26px", color: "#A5A3BE", maxWidth: "52ch" }}>
              {markets.length === 0
                ? "Be the first — create a market on any Aave, Uniswap or ERC-20 event you can point to."
                : "Try a different address or contract, or clear the filters."}
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

      <CreateMarketModal open={modalOpen} onClose={closeCreate} />
    </div>
  );
}
