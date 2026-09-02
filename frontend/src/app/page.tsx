"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";

const EM_DASH = "—";

type Market = {
  resolves: string;
  question: string;
  yes: number;
  pool: string;
};

const MARKETS: Market[] = [
  {
    resolves: "Resolves at block 9,481,200",
    question: "Will 0xWhale.eth move 100+ ETH before Friday?",
    yes: 68,
    pool: "41.2 CTC",
  },
  {
    resolves: "Resolves at block 9,481,200",
    question: "Will the Sepolia treasury contract's pause switch flip?",
    yes: 23,
    pool: "12.8 CTC",
  },
  {
    resolves: "Resolves at block 9,492,010",
    question: "Will this address's next trade push ETH/USDC below $2,400?",
    yes: 51,
    pool: "88.4 CTC",
  },
  {
    resolves: "Resolves at block 9,488,650",
    question: "Will 0x4c1…9be approve more than 1M USDC to a new spender?",
    yes: 34,
    pool: "27.5 CTC",
  },
  {
    resolves: "Resolves at block 9,502,000",
    question: "Will the vault contract's supply cross 50,000 shares?",
    yes: 44,
    pool: "19.1 CTC",
  },
  {
    resolves: "Resolves when voting closes on-chain",
    question: "Will proposal 118 reach quorum before voting closes?",
    yes: 72,
    pool: "63.7 CTC",
  },
];

const HOW_STEPS = [
  {
    n: 1,
    color: "#7C5CFF",
    title: "A question is listed",
    body: `Narrow, yes-or-no, and about one discrete on-chain event ${EM_DASH} with the exact address, amount and block written into the market.`,
  },
  {
    n: 2,
    color: "#7C5CFF",
    title: "You take a position",
    body: `Yes or no. Your deposit joins one of two pools on Creditcoin and stays there ${EM_DASH} nothing is bridged anywhere.`,
  },
  {
    n: 3,
    color: "#7C5CFF",
    title: "The event happens, or it doesn't",
    body: "If it happens on Sepolia, a proof of that transaction is submitted to the market. If the deadline passes first, no is the answer.",
  },
  {
    n: 4,
    color: "#2FE6D9",
    title: "The market resolves itself",
    body: "The precompile verifies the proof in the same transaction that resolves the market. Winners claim their share of the other pool.",
  },
];

const REMOVES = [
  {
    title: "The admin key",
    body: "No account can decide an outcome, pause a resolution, or override a proof. There is nothing to trust and nothing to bribe.",
  },
  {
    title: "The dispute window",
    body: "A proof is either valid or it isn't, and the chain answers that inside one transaction. There is nothing left to argue about afterwards.",
  },
  {
    title: "The bridge",
    body: "Cascade reads Sepolia without moving anything across chains. Only the proof travels; your collateral never leaves Creditcoin.",
  },
];

type AnimEngine = {
  reduced: boolean;
  els: HTMLElement[];
  scroller: HTMLElement | null;
  raf: number | null;
  stage: number;
  running: boolean;
};

export default function Home() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const demoRef = useRef<HTMLDivElement | null>(null);

  const [stage, setStage] = useState(0);
  const [running, setRunning] = useState(false);

  const engine = useRef<AnimEngine>({
    reduced: false,
    els: [],
    scroller: null,
    raf: null,
    stage: 0,
    running: false,
  });
  const runTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    engine.current.stage = stage;
    engine.current.running = running;
  }, [stage, running]);

  useEffect(() => {
    const e = engine.current;
    e.reduced = !!(
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );

    const collect = () => {
      const root = rootRef.current;
      if (!root) return;
      e.els = Array.from(root.querySelectorAll<HTMLElement>("[data-csc]"));
      let n: HTMLElement | null = root.parentElement;
      e.scroller = (document.scrollingElement || document.documentElement) as HTMLElement;
      while (n && n !== document.body) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 4) {
          e.scroller = n;
          break;
        }
        n = n.parentElement;
      }
    };

    const scrollTop = () => {
      const sc = e.scroller;
      if (!sc) return window.scrollY || 0;
      return sc === (document.scrollingElement || document.documentElement)
        ? window.scrollY || sc.scrollTop || 0
        : sc.scrollTop;
    };

    const scrub = (vh: number) => {
      if (e.running || !demoRef.current) return;
      const r = demoRef.current.getBoundingClientRect();
      if (!r.height) return;
      const h = vh || window.innerHeight || 1;
      const p = (h - r.top) / (h + r.height * 0.55);
      const nextStage = p < 0.3 ? 0 : p < 0.44 ? 1 : p < 0.56 ? 2 : p < 0.68 ? 3 : 4;
      if (nextStage !== e.stage) {
        e.stage = nextStage;
        setStage(nextStage);
      }
    };

    const tick = () => {
      e.raf = null;
      const vh = window.innerHeight || 1;
      const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
      const top = scrollTop();

      e.els.forEach((el) => {
        const kind = el.dataset.csc;
        if (kind === "progress") {
          const sc = e.scroller;
          if (!sc) return;
          const max = Math.max(1, (sc.scrollHeight || 1) - (sc.clientHeight || vh));
          el.style.transform = "scaleX(" + clamp(top / max) + ")";
          return;
        }
        if (e.reduced) return;
        const r = el.getBoundingClientRect();
        if (!r.height) return;
        if (kind === "glow") {
          const p = clamp(top / (vh * 0.9));
          el.style.opacity = String(1 - 0.85 * p);
          el.style.transform =
            "translateX(-50%) translateY(" + 70 * p + "px) scale(" + (1 + 0.18 * p) + ")";
          return;
        }
        if (kind === "hero") {
          const depth = parseFloat(el.dataset.cscDepth || "1");
          const p = clamp(top / (vh * 0.62));
          el.style.opacity = String(1 - 0.92 * p);
          el.style.transform = "translateY(" + -56 * depth * p + "px)";
          return;
        }
        const p = clamp((vh * 0.94 - r.top) / (vh * 0.42));
        if (kind === "settle") {
          el.style.opacity = String(0.35 + 0.65 * p);
          el.style.transform =
            "translateY(" + 22 * (1 - p) + "px) scale(" + (0.985 + 0.015 * p) + ")";
        } else if (kind === "rise") {
          el.style.opacity = String(0.25 + 0.75 * p);
          el.style.transform = "translateY(" + 20 * (1 - p) + "px)";
        } else if (kind === "ctaIn") {
          el.style.opacity = String(0.3 + 0.7 * p);
          el.style.transform = "scale(" + (0.94 + 0.06 * p) + ")";
        }
      });

      scrub(vh);
    };

    const onScroll = () => {
      if (!e.raf) e.raf = requestAnimationFrame(tick);
    };

    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);

    let ro: ResizeObserver | null = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(onScroll);
      ro.observe(document.documentElement);
    }

    collect();
    onScroll();
    const settleTimers = [120, 600].map((ms) =>
      setTimeout(() => {
        collect();
        onScroll();
      }, ms)
    );

    return () => {
      settleTimers.forEach(clearTimeout);
      if (e.raf) {
        cancelAnimationFrame(e.raf);
        e.raf = null;
      }
      if (ro) ro.disconnect();
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    return () => {
      runTimers.current.forEach(clearTimeout);
    };
  }, []);

  const runDemo = () => {
    if (running) return;
    const reducedNow = !!(
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    const t = (ms: number) => (reducedNow ? ms * 0.35 : ms);

    runTimers.current.forEach(clearTimeout);
    runTimers.current = [];

    setStage(0);
    setRunning(true);

    const steps: [number, number][] = [
      [1, 700],
      [2, 1900],
      [3, 3300],
      [4, 4400],
    ];
    runTimers.current = steps.map(([s, ms]) =>
      setTimeout(() => {
        setStage(s);
        setRunning(s < 4);
      }, t(ms))
    );
  };

  const dot = (i: number) => (stage > i ? "#3DDC97" : stage === i ? "#7C5CFF" : "#28283F");
  const statusText =
    stage === 0 ? "Awaiting event" : stage < 3 ? "Verifying" : stage < 4 ? "Proof verified" : "Resolved";
  const statusColor = stage >= 3 ? "#3DDC97" : stage === 0 ? "#6B6889" : "#2FE6D9";
  const yesWidth = stage >= 4 ? "100%" : "68%";
  const o1 = stage >= 1 ? 1 : 0.3;
  const o2 = stage >= 2 ? 1 : 0.3;
  const o3 = stage >= 3 ? 1 : 0.3;
  const o4 = stage >= 4 ? 1 : 0.3;
  const demoLabel = running ? "Verifying…" : stage >= 4 ? "Run it again" : "Run a resolution";
  const sealScale = stage >= 3 ? 1 : 0.4;
  const sealOpacity = stage >= 3 ? 1 : 0;

  return (
    <div
      ref={rootRef}
      className={styles.page}
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
          data-csc="progress"
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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            className={styles.corner}
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              background: "linear-gradient(135deg,#7C5CFF,#2FE6D9)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <div
              className={styles.corner}
              style={{ width: 11, height: 11, borderRadius: 4, background: "#0A0A16" }}
            />
          </div>
          <span
            style={{
              fontFamily: "'Clash Display', sans-serif",
              fontWeight: 600,
              fontSize: 21,
              letterSpacing: "-0.02em",
            }}
          >
            Cascade
          </span>
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: 32, fontSize: 15, color: "#A5A3BE" }}>
          <Link href="/markets" className={styles.navLink}>
            Markets
          </Link>
          <a href="#resolution" className={styles.navLink}>
            Resolution
          </a>
          <a href="#how" className={styles.navLink}>
            How it works
          </a>
        </nav>
        <ConnectWalletButton size="sm" />
      </header>

      <section
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "112px 32px 96px",
        }}
      >
        <div
          data-csc="glow"
          style={{
            position: "absolute",
            top: -180,
            left: "50%",
            transform: "translateX(-50%)",
            width: 900,
            height: 520,
            background:
              "radial-gradient(ellipse at center, rgba(124,92,255,.22), rgba(47,230,217,.06) 45%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          className={styles.corner}
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 16px",
            border: "1px solid #28283F",
            background: "#151527",
            borderRadius: 999,
            fontSize: 14,
            color: "#A5A3BE",
          }}
        >
          <span className={styles.corner} style={{ width: 7, height: 7, borderRadius: 3, background: "#2FE6D9" }} />
          Built on Creditcoin with the Attestcoin protocol
        </div>
        <h1
          data-csc="hero"
          data-csc-depth="1"
          style={{
            position: "relative",
            fontFamily: "'Clash Display', sans-serif",
            fontWeight: 600,
            fontSize: 88,
            lineHeight: 1.0,
            letterSpacing: "-0.035em",
            margin: "28px 0 0",
            maxWidth: "16ch",
          }}
        >
          Markets that{" "}
          <span
            style={{
              background: "linear-gradient(100deg,#7C5CFF,#2FE6D9)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            resolve themselves
          </span>
        </h1>
        <p
          data-csc="hero"
          data-csc-depth="0.55"
          style={{
            position: "relative",
            margin: "26px 0 0",
            maxWidth: "60ch",
            fontSize: 19,
            lineHeight: 1.55,
            color: "#A5A3BE",
          }}
        >
          Cascade is a prediction market for verifiable on-chain events. When the event happens,
          cryptographic proof settles the market {EM_DASH} no admin, no committee, no dispute window.
        </p>
        <div
          data-csc="hero"
          data-csc-depth="0.4"
          style={{
            position: "relative",
            display: "flex",
            gap: 14,
            marginTop: 38,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <a
            href="#markets"
            className={`${styles.corner} ${styles.btnPrimary}`}
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: "#0A0A16",
              background: "#7C5CFF",
              padding: "15px 26px",
              borderRadius: 16,
            }}
          >
            Explore live markets
          </a>
          <a
            href="#resolution"
            className={`${styles.corner} ${styles.btnOutline}`}
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: "#F5F4FB",
              background: "#151527",
              border: "1px solid #28283F",
              padding: "15px 26px",
              borderRadius: 16,
            }}
          >
            See a market resolve
          </a>
        </div>
        <div
          style={{
            position: "relative",
            display: "flex",
            gap: 40,
            marginTop: 56,
            flexWrap: "wrap",
            justifyContent: "center",
            fontSize: 15,
            color: "#6B6889",
          }}
        >
          <span>Verified on-chain in seconds</span>
          <span>No oracle, no relayer</span>
          <span>Proof travels cross-chain, your collateral doesn&apos;t</span>
        </div>
      </section>

      <section id="markets" style={{ padding: "24px 48px 104px", maxWidth: 1360, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 32,
            flexWrap: "wrap",
            marginBottom: 28,
          }}
        >
          <div>
            <h2
              data-csc="rise"
              style={{
                fontFamily: "'Clash Display', sans-serif",
                fontWeight: 500,
                fontSize: 40,
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
                margin: 0,
              }}
            >
              Open markets
            </h2>
            <p style={{ margin: "10px 0 0", color: "#A5A3BE", maxWidth: "62ch" }}>
              Every question below is a single, discrete event on Ethereum Sepolia. If it can&apos;t be
              proven on-chain, it can&apos;t be listed here.
            </p>
          </div>
          <div
            className={styles.corner}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 16px",
              background: "#151527",
              border: "1px solid #28283F",
              borderRadius: 14,
              fontSize: 14,
              color: "#A5A3BE",
            }}
          >
            <span
              className={`${styles.corner} ${styles.livePulse}`}
              style={{ width: 7, height: 7, borderRadius: 3, background: "#FF4FD8" }}
            />
            Watching 1,284 addresses live
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 20,
          }}
        >
          {MARKETS.map((m, i) => (
            <article
              key={i}
              data-csc="settle"
              className={styles.corner}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 18,
                padding: 24,
                background: "#151527",
                border: "1px solid #28283F",
                borderRadius: 28,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 13,
                  color: "#6B6889",
                }}
              >
                <span>{m.resolves}</span>
                <span style={{ color: "#3DDC97" }}>Open</span>
              </div>
              <h3
                style={{
                  fontFamily: "'Clash Display', sans-serif",
                  fontWeight: 500,
                  fontSize: 22,
                  lineHeight: 1.2,
                  letterSpacing: "-0.02em",
                  margin: 0,
                  color: "#F5F4FB",
                }}
              >
                {m.question}
              </h3>
              <div
                className={styles.corner}
                style={{ display: "flex", height: 8, borderRadius: 6, overflow: "hidden", background: "#0A0A16" }}
              >
                <div style={{ width: `${m.yes}%`, background: "#3DDC97" }} />
                <div style={{ width: `${100 - m.yes}%`, background: "#FF5C7A" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#A5A3BE" }}>
                <span style={{ color: "#3DDC97", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                  Yes {m.yes}%
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>Pool {m.pool}</span>
                <span style={{ color: "#FF5C7A", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                  No {100 - m.yes}%
                </span>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className={`${styles.corner} ${styles.btnYes}`}
                  style={{
                    flex: 1,
                    fontFamily: "'General Sans', sans-serif",
                    fontSize: 15,
                    fontWeight: 500,
                    color: "#3DDC97",
                    background: "rgba(61,220,151,.1)",
                    border: "1px solid rgba(61,220,151,.28)",
                    padding: 11,
                    borderRadius: 14,
                    cursor: "pointer",
                  }}
                >
                  Yes
                </button>
                <button
                  className={`${styles.corner} ${styles.btnNo}`}
                  style={{
                    flex: 1,
                    fontFamily: "'General Sans', sans-serif",
                    fontSize: 15,
                    fontWeight: 500,
                    color: "#FF5C7A",
                    background: "rgba(255,92,122,.1)",
                    border: "1px solid rgba(255,92,122,.28)",
                    padding: 11,
                    borderRadius: 14,
                    cursor: "pointer",
                  }}
                >
                  No
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        id="resolution"
        ref={demoRef}
        style={{
          padding: "96px 48px",
          borderTop: "1px solid #28283F",
          borderBottom: "1px solid #28283F",
          background: "linear-gradient(180deg,#0A0A16,#0D0D1D)",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "minmax(320px,1fr) minmax(420px,1.15fr)",
            gap: 72,
            alignItems: "center",
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "'Clash Display', sans-serif",
                fontWeight: 600,
                fontSize: 44,
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
                margin: 0,
              }}
            >
              Verified. Resolved. Paid out.
            </h2>
            <p style={{ margin: "20px 0 0", color: "#A5A3BE", maxWidth: "52ch", fontSize: 18 }}>
              The event happens on Sepolia. A proof is submitted to the market&apos;s resolution function
              on Creditcoin. The Attestcoin precompile verifies it inside that same transaction {EM_DASH}{" "}
              and the pool pays out. Nobody votes. Nobody signs off.
            </p>
            <p style={{ margin: "18px 0 0", color: "#6B6889", maxWidth: "52ch" }}>
              Verified on-chain in seconds, with no dispute window to wait through.
            </p>
            <button
              onClick={runDemo}
              className={`${styles.corner} ${styles.btnTeal}`}
              style={{
                marginTop: 32,
                fontFamily: "'General Sans', sans-serif",
                fontSize: 16,
                fontWeight: 500,
                color: "#0A0A16",
                background: "#2FE6D9",
                border: "none",
                padding: "15px 26px",
                borderRadius: 16,
                cursor: "pointer",
              }}
            >
              {demoLabel}
            </button>
          </div>

          <div
            className={styles.corner}
            style={{
              position: "relative",
              padding: 32,
              background: "#151527",
              border: "1px solid #28283F",
              borderRadius: 32,
              boxShadow: "0 40px 80px -40px rgba(124,92,255,.35)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 13,
                color: "#6B6889",
                marginBottom: 16,
              }}
            >
              <span>Market #0412</span>
              <span style={{ color: statusColor }}>{statusText}</span>
            </div>
            <h3
              style={{
                fontFamily: "'Clash Display', sans-serif",
                fontWeight: 500,
                fontSize: 26,
                lineHeight: 1.2,
                letterSpacing: "-0.02em",
                margin: "0 0 24px",
              }}
            >
              Will 0xWhale.eth move 100+ ETH before Friday?
            </h3>

            <div
              className={styles.corner}
              style={{
                display: "flex",
                height: 10,
                borderRadius: 6,
                overflow: "hidden",
                background: "#0A0A16",
                marginBottom: 12,
              }}
            >
              <div style={{ width: yesWidth, background: "#3DDC97", transition: "width 900ms ease-out" }} />
              <div style={{ flex: 1, background: "#FF5C7A" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#A5A3BE", marginBottom: 28 }}>
              <span style={{ color: "#3DDC97", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                Yes {yesWidth}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>Pool 41.2 CTC</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, opacity: o1, transition: "opacity 400ms ease-out" }}>
                <span
                  className={styles.corner}
                  style={{ width: 10, height: 10, borderRadius: 4, background: dot(1), transition: "background 400ms ease-out" }}
                />
                <span style={{ fontSize: 15 }}>Transfer of 128 ETH detected on Sepolia</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, opacity: o2, transition: "opacity 400ms ease-out" }}>
                <span
                  className={`${styles.corner} ${stage === 2 ? styles.provingPulse : ""}`}
                  style={{ width: 10, height: 10, borderRadius: 4, background: dot(2), transition: "background 400ms ease-out" }}
                />
                <span style={{ fontSize: 15 }}>Proof submitted to the market on Creditcoin</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, opacity: o3, transition: "opacity 400ms ease-out" }}>
                <span
                  className={styles.corner}
                  style={{ width: 10, height: 10, borderRadius: 4, background: dot(3), transition: "background 400ms ease-out" }}
                />
                <span style={{ fontSize: 15 }}>Attestcoin precompile verified the proof in-transaction</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, opacity: o4, transition: "opacity 400ms ease-out" }}>
                <span
                  className={styles.corner}
                  style={{ width: 10, height: 10, borderRadius: 4, background: dot(4), transition: "background 400ms ease-out" }}
                />
                <span style={{ fontSize: 15 }}>Winners can claim from the pool</span>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                marginTop: 32,
                paddingTop: 26,
                borderTop: "1px solid #28283F",
              }}
            >
              <div
                className={styles.corner}
                style={{
                  width: 64,
                  height: 64,
                  flex: "none",
                  borderRadius: 22,
                  background: "linear-gradient(135deg,#7C5CFF,#2FE6D9)",
                  display: "grid",
                  placeItems: "center",
                  transform: `scale(${sealScale})`,
                  opacity: sealOpacity,
                  transition: "transform 620ms cubic-bezier(0.34,1.56,0.64,1), opacity 420ms ease-out",
                }}
              >
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0A0A16" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12.5 L9.5 18 L20 6.5" />
                </svg>
              </div>
              <div style={{ opacity: o4, transition: "opacity 500ms ease-out" }}>
                <div
                  style={{
                    fontFamily: "'Clash Display', sans-serif",
                    fontSize: 26,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  Resolved yes
                </div>
                <div style={{ fontSize: 14, color: "#A5A3BE", fontVariantNumeric: "tabular-nums" }}>
                  13.2 CTC paid to yes positions in the same block
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" style={{ padding: "104px 48px", maxWidth: 1200, margin: "0 auto" }}>
        <h2
          data-csc="rise"
          style={{
            fontFamily: "'Clash Display', sans-serif",
            fontWeight: 500,
            fontSize: 40,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            margin: "0 0 12px",
          }}
        >
          How a market works
        </h2>
        <p style={{ margin: "0 0 48px", color: "#A5A3BE", maxWidth: "60ch" }}>
          Four steps, none of which involve a person deciding what happened.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))", gap: 20 }}>
          {HOW_STEPS.map((s) => (
            <div
              key={s.n}
              className={styles.corner}
              style={{ padding: 26, background: "#151527", border: "1px solid #28283F", borderRadius: 28 }}
            >
              <div
                style={{
                  fontFamily: "'Clash Display', sans-serif",
                  fontSize: 34,
                  fontWeight: 600,
                  color: s.color,
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {s.n}
              </div>
              <h3
                style={{
                  fontFamily: "'Clash Display', sans-serif",
                  fontWeight: 500,
                  fontSize: 21,
                  letterSpacing: "-0.02em",
                  margin: "16px 0 8px",
                }}
              >
                {s.title}
              </h3>
              <p style={{ margin: 0, color: "#A5A3BE", fontSize: 15 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "0 48px 104px", maxWidth: 1200, margin: "0 auto" }}>
        <div className={styles.corner} style={{ padding: 48, background: "#151527", border: "1px solid #28283F", borderRadius: 32 }}>
          <h2
            data-csc="rise"
            style={{
              fontFamily: "'Clash Display', sans-serif",
              fontWeight: 500,
              fontSize: 36,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              margin: "0 0 36px",
            }}
          >
            What Cascade removes
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))", gap: 36 }}>
            {REMOVES.map((r) => (
              <div key={r.title}>
                <h3
                  style={{
                    fontFamily: "'Clash Display', sans-serif",
                    fontWeight: 500,
                    fontSize: 22,
                    letterSpacing: "-0.02em",
                    margin: "0 0 10px",
                    color: "#FF5C7A",
                  }}
                >
                  {r.title}
                </h3>
                <p style={{ margin: 0, color: "#A5A3BE", fontSize: 15 }}>{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "0 32px 120px" }}>
        <h2
          data-csc="ctaIn"
          style={{
            fontFamily: "'Clash Display', sans-serif",
            fontWeight: 600,
            fontSize: 56,
            lineHeight: 1.05,
            letterSpacing: "-0.035em",
            margin: 0,
            maxWidth: "24ch",
          }}
        >
          Take a position on something you already have an opinion about
        </h2>
        <p style={{ margin: "22px 0 0", color: "#A5A3BE", maxWidth: "56ch", fontSize: 18 }}>
          Connect a wallet to open a market, or browse what&apos;s live right now. Resolution is the same
          either way.
        </p>
        <div style={{ display: "flex", gap: 14, marginTop: 34, flexWrap: "wrap", justifyContent: "center" }}>
          <ConnectWalletButton size="lg" />
          <a
            href="#markets"
            className={`${styles.corner} ${styles.btnOutline}`}
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: "#F5F4FB",
              background: "#151527",
              border: "1px solid #28283F",
              padding: "15px 26px",
              borderRadius: 16,
            }}
          >
            Browse markets
          </a>
        </div>
      </section>

      <footer
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
          padding: "28px 48px",
          borderTop: "1px solid #28283F",
          fontSize: 14,
          color: "#6B6889",
        }}
      >
        <span>Cascade {EM_DASH} a trustless prediction market for on-chain events</span>
        <div style={{ display: "flex", gap: 28 }}>
          <Link href="/markets" className={styles.footerLink}>
            Markets
          </Link>
          <a href="#how" className={styles.footerLink}>
            Docs
          </a>
          <a href="#resolution" className={styles.footerLink}>
            Contracts
          </a>
        </div>
      </footer>
    </div>
  );
}
