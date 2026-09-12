"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isAddress, parseEventLogs, parseUnits, type Address } from "viem";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import landing from "@/app/page.module.css";
import styles from "@/app/markets/page.module.css";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { creditcoinTestnet, sepolia } from "@/config/web3";
import { persistCreatedMarket } from "@/lib/api";
import {
  AAVE_BORROW_SIG,
  AAVE_SUPPLY_SIG,
  AAVE_V3_POOL,
  ComparisonOperator,
  ComparisonOperatorName,
  ERC20_TRANSFER_SIG,
  EventTemplate,
  EventTemplateName,
  MARKETS_CONTRACT_ADDRESS,
  MarketType,
  MarketTypeName,
  SEPOLIA_CHAIN_KEY,
  UNISWAP_V3_SWAP_SIG,
  erc20Abi,
  marketsAbi,
} from "@/lib/contracts/markets";

const EM_DASH = "—";
const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";
const MIN_LEAD_MS = 60 * 60 * 1000; // contract only checks deadline > now; we enforce >= 1h client-side

// ─────────────────────────────────────────────────────────────────────────
// Presets — five fixed shapes, per market-creation-brief.md. Every field the
// user can actually touch is scoped to one of these; eventTemplate,
// eventSignature (beyond the Aave supply/borrow toggle), chainKey and
// marketType are never surfaced directly.
// ─────────────────────────────────────────────────────────────────────────

type PresetId = "aave-volume" | "aave-activity" | "aave-pool-activity" | "uniswap-swaps" | "whale-transfer";

function Badge({ label, gradient }: { label: string; gradient: string }) {
  return (
    <div
      className={landing.corner}
      style={{
        width: 38,
        height: 38,
        flex: "none",
        borderRadius: 12,
        background: gradient,
        display: "grid",
        placeItems: "center",
        fontFamily: "'Clash Display', sans-serif",
        fontWeight: 600,
        fontSize: 12.5,
        letterSpacing: "-0.01em",
        color: "#0A0A16",
      }}
    >
      {label}
    </div>
  );
}

const PRESETS: { id: PresetId; title: string; tagline: string; icon: ReactNode }[] = [
  {
    id: "aave-volume",
    title: "Aave reserve volume",
    tagline: "Will total supply/borrow of a token on Aave cross a threshold?",
    icon: <Badge label="AV" gradient="linear-gradient(135deg,#7C5CFF,#2FE6D9)" />,
  },
  {
    id: "aave-activity",
    title: "Aave reserve activity",
    tagline: "Will a token see N+ supply/borrow events on Aave?",
    icon: <Badge label="AR" gradient="linear-gradient(135deg,#7C5CFF,#FF4FD8)" />,
  },
  {
    id: "aave-pool-activity",
    title: "Aave pool activity",
    tagline: "Will the whole Aave pool see N+ supply/borrow events?",
    icon: <Badge label="AP" gradient="linear-gradient(135deg,#2FE6D9,#3DDC97)" />,
  },
  {
    id: "uniswap-swaps",
    title: "Uniswap swap count",
    tagline: "Will a Uniswap V3 pool see N+ swaps before a deadline?",
    icon: <Badge label="UNI" gradient="linear-gradient(135deg,#FF4FD8,#7C5CFF)" />,
  },
  {
    id: "whale-transfer",
    title: "Whale transfer",
    tagline: "Will an address move X+ of a token before a deadline?",
    icon: <Badge label="WH" gradient="linear-gradient(135deg,#3DDC97,#2FE6D9)" />,
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Small style helpers — mirrors the field/label styling already used
// elsewhere in the markets page, so the two forms feel like one system.
// ─────────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#6B6889",
};

const hintStyle: React.CSSProperties = { margin: 0, fontSize: 13, color: "#6B6889" };

function fieldStyle(invalid?: boolean, ok?: boolean): React.CSSProperties {
  return {
    fontFamily: "'General Sans', sans-serif",
    fontSize: 15,
    color: "#F5F4FB",
    background: "#0A0A16",
    border: `1px solid ${invalid ? "#FF5C7A" : ok ? "rgba(61,220,151,.4)" : "#28283F"}`,
    borderRadius: 16,
    padding: "14px 16px",
    width: "100%",
  };
}

function addressFieldStyle(invalid?: boolean, ok?: boolean): React.CSSProperties {
  return {
    ...fieldStyle(invalid, ok),
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 14.5,
    letterSpacing: "0.01em",
  };
}

function minDeadlineLocal(): string {
  const d = new Date(Date.now() + MIN_LEAD_MS + 60 * 1000); // pad a minute for UI/submit latency
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/// Reads an ERC20's decimals()/symbol() for a candidate address, only once
/// it's well-formed — token-amount thresholds need this to convert the
/// user's human-readable number into the raw integer the contract stores.
/// Pinned to Sepolia: these are source-chain tokens (Aave reserves, whale
/// transfer tokens), but the wallet is connected to creditcoinTestnet to
/// submit createMarket, so the default (wallet's active chain) would read
/// against the wrong RPC and fail.
function useTokenMeta(candidate: string, enabled: boolean) {
  const valid = isAddress(candidate);
  const address = valid ? (candidate as Address) : undefined;
  const decimals = useReadContract({
    address,
    abi: erc20Abi,
    functionName: "decimals",
    chainId: sepolia.id,
    query: { enabled: enabled && valid },
  });
  const symbol = useReadContract({
    address,
    abi: erc20Abi,
    functionName: "symbol",
    chainId: sepolia.id,
    query: { enabled: enabled && valid },
  });
  return {
    valid,
    loading: enabled && valid && (decimals.isFetching || symbol.isFetching),
    error: enabled && valid && (decimals.isError || symbol.isError),
    decimals: decimals.data,
    symbol: symbol.data,
  };
}

export function CreateMarketModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { address: account, chainId, isConnected } = useAccount();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [preset, setPreset] = useState<PresetId | null>(null);
  const [supplyOrBorrow, setSupplyOrBorrow] = useState<"supply" | "borrow">("supply");
  const [reserveToken, setReserveToken] = useState("");
  const [uniswapPool, setUniswapPool] = useState("");
  const [whaleAddress, setWhaleAddress] = useState("");
  const [whaleToken, setWhaleToken] = useState("");
  const [thresholdHuman, setThresholdHuman] = useState("");
  const [comparison, setComparison] = useState<"GTE" | "LTE">("GTE");
  const [deadlineLocal, setDeadlineLocal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeVeilRef = useRef<HTMLDivElement | null>(null);

  const reserveMeta = useTokenMeta(reserveToken, preset === "aave-volume" || preset === "aave-activity");
  const whaleTokenMeta = useTokenMeta(whaleToken, preset === "whale-transfer");

  const reset = () => {
    setPreset(null);
    setSupplyOrBorrow("supply");
    setReserveToken("");
    setUniswapPool("");
    setWhaleAddress("");
    setWhaleToken("");
    setThresholdHuman("");
    setComparison("GTE");
    setDeadlineLocal("");
    setSubmitting(false);
    setError(null);
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  useEffect(() => {
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isTokenAmountPreset = preset === "aave-volume" || preset === "whale-transfer";
  const isCountPreset = preset === "aave-activity" || preset === "aave-pool-activity" || preset === "uniswap-swaps";

  const activeTokenMeta = preset === "aave-volume" ? reserveMeta : preset === "whale-transfer" ? whaleTokenMeta : null;

  const thresholdNumberValid = useMemo(() => {
    const t = thresholdHuman.trim();
    if (!t) return false;
    if (isTokenAmountPreset) return /^\d+(\.\d+)?$/.test(t) && parseFloat(t) > 0;
    return /^\d+$/.test(t) && BigInt(t) > BigInt(0);
  }, [thresholdHuman, isTokenAmountPreset]);

  const deadlineValid = useMemo(() => {
    if (!deadlineLocal) return false;
    const ts = new Date(deadlineLocal).getTime();
    return Number.isFinite(ts) && ts >= Date.now() + MIN_LEAD_MS;
  }, [deadlineLocal]);

  // Per-preset field validity
  const fieldsValid: boolean = (() => {
    if (!preset) return false;
    if (!thresholdNumberValid || !deadlineValid) return false;
    switch (preset) {
      case "aave-volume":
        return isAddress(reserveToken) && !!reserveMeta.decimals && !reserveMeta.error;
      case "aave-activity":
        return isAddress(reserveToken);
      case "aave-pool-activity":
        return true;
      case "uniswap-swaps":
        return isAddress(uniswapPool);
      case "whale-transfer":
        return isAddress(whaleAddress) && isAddress(whaleToken) && !!whaleTokenMeta.decimals && !whaleTokenMeta.error;
    }
  })();

  const contractConfigured = MARKETS_CONTRACT_ADDRESS !== ZERO_ADDRESS;
  const wrongNetwork = isConnected && chainId !== creditcoinTestnet.id;
  const canSubmit = fieldsValid && contractConfigured && isConnected && !wrongNetwork && !submitting;

  // ── Human-readable preview, mirrors what actually gets written on-chain ──
  const preview = useMemo(() => {
    if (!preset || !fieldsValid) return null;
    const cmpWord = comparison === "GTE" ? "at least" : "at most";
    switch (preset) {
      case "aave-volume": {
        const sym = reserveMeta.symbol || "token";
        return `Will total ${supplyOrBorrow} volume of ${sym} on Aave reach ${cmpWord} ${thresholdHuman} ${sym} before the deadline?`;
      }
      case "aave-activity": {
        const sym = reserveMeta.symbol || "this token";
        return `Will ${sym} see at least ${thresholdHuman} ${supplyOrBorrow} events on Aave before the deadline?`;
      }
      case "aave-pool-activity":
        return `Will the whole Aave pool see at least ${thresholdHuman} ${supplyOrBorrow} events before the deadline?`;
      case "uniswap-swaps":
        return `Will pool ${uniswapPool.slice(0, 6)}…${uniswapPool.slice(-4)} see at least ${thresholdHuman} swaps before the deadline?`;
      case "whale-transfer": {
        const sym = whaleTokenMeta.symbol || "token";
        return `Will ${whaleAddress.slice(0, 6)}…${whaleAddress.slice(-4)} move at least ${thresholdHuman} ${sym} before the deadline?`;
      }
    }
  }, [preset, fieldsValid, comparison, supplyOrBorrow, thresholdHuman, reserveMeta, uniswapPool, whaleAddress, whaleTokenMeta]);

  async function handleSubmit() {
    if (!preset || !fieldsValid || !publicClient) return;
    setError(null);
    setSubmitting(true);
    try {
      if (wrongNetwork) {
        await switchChainAsync({ chainId: creditcoinTestnet.id });
      }

      const deadline = BigInt(Math.floor(new Date(deadlineLocal).getTime() / 1000));
      const supplyBorrowSig = supplyOrBorrow === "supply" ? AAVE_SUPPLY_SIG : AAVE_BORROW_SIG;

      let args: readonly [number, number, bigint, Address, `0x${string}`, Address, number, bigint, bigint];
      switch (preset) {
        case "aave-volume": {
          const threshold = parseUnits(thresholdHuman, reserveMeta.decimals!);
          args = [
            MarketType.Cumulative,
            EventTemplate.AddressPrefixedValue,
            SEPOLIA_CHAIN_KEY,
            AAVE_V3_POOL,
            supplyBorrowSig,
            reserveToken as Address,
            comparison === "GTE" ? ComparisonOperator.GTE : ComparisonOperator.LTE,
            threshold,
            deadline,
          ];
          break;
        }
        case "aave-activity": {
          args = [
            MarketType.Cumulative,
            EventTemplate.EventCount,
            SEPOLIA_CHAIN_KEY,
            AAVE_V3_POOL,
            supplyBorrowSig,
            reserveToken as Address,
            comparison === "GTE" ? ComparisonOperator.GTE : ComparisonOperator.LTE,
            BigInt(thresholdHuman),
            deadline,
          ];
          break;
        }
        case "aave-pool-activity": {
          args = [
            MarketType.Cumulative,
            EventTemplate.EventCount,
            SEPOLIA_CHAIN_KEY,
            AAVE_V3_POOL,
            supplyBorrowSig,
            ZERO_ADDRESS,
            ComparisonOperator.GTE,
            BigInt(thresholdHuman),
            deadline,
          ];
          break;
        }
        case "uniswap-swaps": {
          args = [
            MarketType.Cumulative,
            EventTemplate.EventCount,
            SEPOLIA_CHAIN_KEY,
            uniswapPool as Address,
            UNISWAP_V3_SWAP_SIG,
            ZERO_ADDRESS,
            ComparisonOperator.GTE,
            BigInt(thresholdHuman),
            deadline,
          ];
          break;
        }
        case "whale-transfer": {
          const threshold = parseUnits(thresholdHuman, whaleTokenMeta.decimals!);
          args = [
            MarketType.SingleEvent,
            EventTemplate.SingleWordValue,
            SEPOLIA_CHAIN_KEY,
            whaleToken as Address,
            ERC20_TRANSFER_SIG,
            whaleAddress as Address,
            ComparisonOperator.GTE,
            threshold,
            deadline,
          ];
          break;
        }
      }

      const hash = await writeContractAsync({
        address: MARKETS_CONTRACT_ADDRESS,
        abi: marketsAbi,
        functionName: "createMarket",
        args,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const [created] = parseEventLogs({ abi: marketsAbi, eventName: "MarketCreated", logs: receipt.logs });
      const marketId = created?.args?.marketId;

      // Mirror the on-chain market into Firestore (via the backend) so the app
      // can show the human-readable question and preset the contract doesn't
      // store. The market already exists on-chain — a failure here is logged
      // but must not block the user.
      if (marketId !== undefined && account) {
        const [mType, eTemplate, cKey, srcContract, eSignature, watched, cmp, thr, dline] = args;
        try {
          await persistCreatedMarket({
            marketId: marketId.toString(),
            creator: account,
            txHash: hash,
            question: preview ?? "",
            preset,
            marketType: MarketTypeName[mType],
            eventTemplate: EventTemplateName[eTemplate],
            comparisonOperator: ComparisonOperatorName[cmp],
            chainKey: cKey.toString(),
            sourceContract: srcContract,
            eventSignature: eSignature,
            watchedAddress: watched,
            threshold: thr.toString(),
            thresholdDisplay: thresholdHuman.trim() || undefined,
            tokenSymbol: activeTokenMeta?.symbol ?? undefined,
            tokenDecimals: activeTokenMeta?.decimals ?? undefined,
            deadline: dline.toString(),
          });
        } catch (persistErr) {
          console.warn("Market created on-chain but not saved to Firestore:", persistErr);
        }
      }

      reset();
      onClose();
      if (marketId !== undefined) {
        router.push(`/markets/${marketId.toString()}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transaction failed";
      setError(message.length > 220 ? message.slice(0, 220) + "…" : message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const activePreset = PRESETS.find((p) => p.id === preset);

  return (
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
      <div ref={closeVeilRef} onClick={close} style={{ position: "absolute", inset: 0 }} />
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
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 24,
            padding: "30px 32px 22px",
            borderBottom: "1px solid #28283F",
          }}
        >
          <div>
            <h2 style={{ fontFamily: "'Clash Display', sans-serif", fontWeight: 600, fontSize: 28, lineHeight: 1.1, letterSpacing: "-0.03em", margin: 0 }}>
              Create a market
            </h2>
            <p style={{ margin: "10px 0 0", fontSize: 15, color: "#A5A3BE", maxWidth: "52ch" }}>
              {preset
                ? "Fill in the fields below — everything else is fixed so the market can always resolve."
                : "Pick what you're predicting. Each type maps to a fixed, verifiable on-chain condition."}
            </p>
          </div>
          <button
            onClick={close}
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
          {!contractConfigured && (
            <div className={landing.corner} style={{ padding: "14px 16px", background: "rgba(255,92,122,.08)", border: "1px solid rgba(255,92,122,.3)", borderRadius: 16, fontSize: 13.5, color: "#FF5C7A" }}>
              Markets contract address isn&apos;t configured yet (NEXT_PUBLIC_MARKETS_CONTRACT_ADDRESS). Market creation is disabled until it&apos;s deployed and set.
            </div>
          )}

          {!preset ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id)}
                  className={landing.corner}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    textAlign: "left",
                    padding: "16px 18px",
                    borderRadius: 20,
                    cursor: "pointer",
                    background: "#0A0A16",
                    border: "1px solid #28283F",
                    transition: "border-color 200ms ease-out, background 200ms ease-out",
                  }}
                >
                  {p.icon}
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: "#F5F4FB" }}>{p.title}</div>
                    <div style={{ marginTop: 4, fontSize: 13.5, lineHeight: 1.45, color: "#A5A3BE" }}>{p.tagline}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <>
              <button
                onClick={() => setPreset(null)}
                style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, color: "#A5A3BE", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 6 L9 12 L15 18" />
                </svg>
                {activePreset?.title}
                <span style={{ color: "#6B6889" }}>{EM_DASH} change type</span>
              </button>

              {(preset === "aave-volume" || preset === "aave-activity" || preset === "aave-pool-activity") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <label style={labelStyle}>Supply or borrow</label>
                  <div style={{ display: "flex", gap: 10 }}>
                    {(["supply", "borrow"] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => setSupplyOrBorrow(k)}
                        className={landing.corner}
                        style={{
                          flex: 1,
                          textTransform: "capitalize",
                          fontFamily: "'General Sans', sans-serif",
                          fontSize: 15,
                          fontWeight: 500,
                          padding: 13,
                          borderRadius: 14,
                          cursor: "pointer",
                          color: supplyOrBorrow === k ? "#F5F4FB" : "#A5A3BE",
                          background: supplyOrBorrow === k ? "rgba(124,92,255,.1)" : "#0A0A16",
                          border: `1px solid ${supplyOrBorrow === k ? "#7C5CFF" : "#28283F"}`,
                        }}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(preset === "aave-volume" || preset === "aave-activity") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <label style={labelStyle}>Reserve token address</label>
                  <input
                    value={reserveToken}
                    onChange={(e) => setReserveToken(e.target.value.trim())}
                    spellCheck={false}
                    placeholder="0x…"
                    className={styles.field}
                    style={addressFieldStyle(reserveToken.length > 0 && !isAddress(reserveToken), reserveMeta.valid && !!reserveMeta.decimals)}
                  />
                  <p style={hintStyle}>
                    {reserveToken.length > 0 && !isAddress(reserveToken)
                      ? "That's not a well-formed address."
                      : reserveMeta.loading
                        ? "Reading token decimals…"
                        : reserveMeta.error
                          ? "Couldn't read decimals()/symbol() from that address — is it an ERC20 on this network?"
                          : reserveMeta.decimals !== undefined
                            ? `${reserveMeta.symbol || "Token"} · ${reserveMeta.decimals} decimals`
                            : "Paste the reserve token's contract address."}
                  </p>
                </div>
              )}

              {preset === "uniswap-swaps" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <label style={labelStyle}>Uniswap V3 pool address</label>
                  <input
                    value={uniswapPool}
                    onChange={(e) => setUniswapPool(e.target.value.trim())}
                    spellCheck={false}
                    placeholder="0x…"
                    className={styles.field}
                    style={addressFieldStyle(uniswapPool.length > 0 && !isAddress(uniswapPool), isAddress(uniswapPool))}
                  />
                  <p style={hintStyle}>{uniswapPool.length > 0 && !isAddress(uniswapPool) ? "That's not a well-formed address." : "The pool contract whose Swap events are counted."}</p>
                </div>
              )}

              {preset === "whale-transfer" && (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label style={labelStyle}>Whale address (the sender being watched)</label>
                    <input
                      value={whaleAddress}
                      onChange={(e) => setWhaleAddress(e.target.value.trim())}
                      spellCheck={false}
                      placeholder="0x…"
                      className={styles.field}
                      style={addressFieldStyle(whaleAddress.length > 0 && !isAddress(whaleAddress), isAddress(whaleAddress))}
                    />
                    <p style={hintStyle}>{whaleAddress.length > 0 && !isAddress(whaleAddress) ? "That's not a well-formed address." : "Checked against the Transfer event's `from`."}</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label style={labelStyle}>Token address</label>
                    <input
                      value={whaleToken}
                      onChange={(e) => setWhaleToken(e.target.value.trim())}
                      spellCheck={false}
                      placeholder="0x…"
                      className={styles.field}
                      style={addressFieldStyle(whaleToken.length > 0 && !isAddress(whaleToken), whaleTokenMeta.valid && !!whaleTokenMeta.decimals)}
                    />
                    <p style={hintStyle}>
                      {whaleToken.length > 0 && !isAddress(whaleToken)
                        ? "That's not a well-formed address."
                        : whaleTokenMeta.loading
                          ? "Reading token decimals…"
                          : whaleTokenMeta.error
                            ? "Couldn't read decimals()/symbol() from that address — is it an ERC20 on this network?"
                            : whaleTokenMeta.decimals !== undefined
                              ? `${whaleTokenMeta.symbol || "Token"} · ${whaleTokenMeta.decimals} decimals`
                              : "The ERC20 whose Transfer events are watched."}
                    </p>
                  </div>
                </>
              )}

              <div className={landing.corner} style={{ display: "flex", flexDirection: "column", gap: 20, padding: 22, background: "#0A0A16", border: "1px solid #28283F", borderRadius: 22 }}>
                <div style={{ display: "grid", gridTemplateColumns: isTokenAmountPreset && preset === "aave-volume" ? "1fr 1fr" : "1fr", gap: 14 }}>
                  {preset === "aave-volume" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <label style={labelStyle}>At least / at most</label>
                      <div style={{ display: "flex", gap: 10 }}>
                        {(
                          [
                            ["GTE", "At least"],
                            ["LTE", "At most"],
                          ] as const
                        ).map(([k, l]) => (
                          <button
                            key={k}
                            onClick={() => setComparison(k)}
                            className={landing.corner}
                            style={{
                              flex: 1,
                              fontFamily: "'General Sans', sans-serif",
                              fontSize: 14.5,
                              fontWeight: 500,
                              padding: "12px 10px",
                              borderRadius: 12,
                              cursor: "pointer",
                              color: comparison === k ? "#F5F4FB" : "#A5A3BE",
                              background: comparison === k ? "rgba(124,92,255,.1)" : "#151527",
                              border: `1px solid ${comparison === k ? "#7C5CFF" : "#28283F"}`,
                            }}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label style={labelStyle}>{isCountPreset ? "Threshold count" : "Threshold amount"}</label>
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <input
                        value={thresholdHuman}
                        onChange={(e) => setThresholdHuman(e.target.value)}
                        inputMode={isTokenAmountPreset ? "decimal" : "numeric"}
                        placeholder={isTokenAmountPreset ? "100" : "50"}
                        className={styles.field}
                        style={{ ...fieldStyle(), fontVariantNumeric: "tabular-nums", padding: "13px 64px 13px 16px" }}
                      />
                      {isTokenAmountPreset && (
                        <span style={{ position: "absolute", right: 15, fontSize: 13, color: "#6B6889" }}>
                          {(preset === "aave-volume" ? reserveMeta.symbol : whaleTokenMeta.symbol) || ""}
                        </span>
                      )}
                    </div>
                    <p style={hintStyle}>{isCountPreset ? "A plain integer — number of matching events." : "In whole tokens; converted to raw units automatically."}</p>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <label style={labelStyle}>Deadline</label>
                  <input
                    type="datetime-local"
                    value={deadlineLocal}
                    min={minDeadlineLocal()}
                    onChange={(e) => setDeadlineLocal(e.target.value)}
                    className={styles.field}
                    style={{ ...fieldStyle(deadlineLocal.length > 0 && !deadlineValid, deadlineValid), colorScheme: "dark" }}
                  />
                  <p style={hintStyle}>{deadlineLocal && !deadlineValid ? "Must be at least 1 hour from now." : "The market resolves NO automatically if nothing verifies before this time."}</p>
                </div>
              </div>

              {preview && (
                <div className={landing.corner} style={{ display: "flex", gap: 14, padding: "18px 20px", background: "rgba(124,92,255,.08)", border: "1px solid rgba(124,92,255,.3)", borderRadius: 20 }}>
                  <div className={landing.corner} style={{ width: 34, height: 34, flex: "none", borderRadius: 12, background: "linear-gradient(135deg,#7C5CFF,#2FE6D9)", display: "grid", placeItems: "center" }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0A0A16" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12.5 L9.5 18 L20 6.5" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#A5A3BE" }}>Market question</div>
                    <div style={{ marginTop: 6, fontFamily: "'Clash Display', sans-serif", fontSize: 19, fontWeight: 500, lineHeight: 1.25, letterSpacing: "-0.02em", color: "#F5F4FB" }}>{preview}</div>
                  </div>
                </div>
              )}

              {error && (
                <div className={landing.corner} style={{ padding: "14px 16px", background: "rgba(255,92,122,.08)", border: "1px solid rgba(255,92,122,.3)", borderRadius: 16, fontSize: 13.5, color: "#FF5C7A" }}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {preset && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginTop: 26, padding: "22px 32px", borderTop: "1px solid #28283F" }}>
            <span style={{ fontSize: 13.5, color: "#6B6889" }}>
              {!isConnected
                ? "Connect a wallet to create this market."
                : wrongNetwork
                  ? "Switch to Creditcoin testnet to continue."
                  : fieldsValid
                    ? `Resolution runs from the proof ${EM_DASH} no reviewer, no override.`
                    : "Fill in every field to continue."}
            </span>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={close}
                className={`${landing.corner} ${styles.ghostOutline}`}
                style={{ fontFamily: "'General Sans', sans-serif", fontSize: 15, fontWeight: 500, color: "#F5F4FB", background: "#1E1E36", border: "1px solid #28283F", padding: "13px 22px", borderRadius: 14, cursor: "pointer" }}
              >
                Cancel
              </button>
              {!isConnected ? (
                <ConnectWalletButton size="sm" />
              ) : wrongNetwork ? (
                <button
                  onClick={() => switchChainAsync({ chainId: creditcoinTestnet.id })}
                  disabled={switching}
                  className={landing.corner}
                  style={{ fontFamily: "'General Sans', sans-serif", fontSize: 15, fontWeight: 500, color: "#0A0A16", border: "none", padding: "13px 24px", borderRadius: 14, background: "#FF5C7A", cursor: switching ? "wait" : "pointer" }}
                >
                  {switching ? "Switching…" : "Switch network"}
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className={landing.corner}
                  style={{
                    fontFamily: "'General Sans', sans-serif",
                    fontSize: 15,
                    fontWeight: 500,
                    color: canSubmit ? "#0A0A16" : "#6B6889",
                    border: "none",
                    padding: "13px 24px",
                    borderRadius: 14,
                    transition: "background 200ms ease-out",
                    background: canSubmit ? "#2FE6D9" : "#1E1E36",
                    cursor: canSubmit ? "pointer" : "not-allowed",
                    opacity: canSubmit ? 1 : 0.55,
                  }}
                >
                  {submitting ? "Creating…" : "Open market"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
