"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { CSSProperties } from "react";
import landing from "@/app/page.module.css";

type Size = "sm" | "lg";

const SIZE_STYLE: Record<Size, CSSProperties> = {
  sm: { fontSize: 15, padding: "11px 20px", borderRadius: 14 },
  lg: { fontSize: 16, padding: "15px 26px", borderRadius: 16 },
};

export function ConnectWalletButton({ size = "sm" }: { size?: Size }) {
  const baseStyle: CSSProperties = {
    fontFamily: "'General Sans', sans-serif",
    fontWeight: 500,
    border: "none",
    cursor: "pointer",
    ...SIZE_STYLE[size],
  };

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            aria-hidden={!ready}
            style={!ready ? { opacity: 0, pointerEvents: "none", userSelect: "none" } : undefined}
          >
            {!connected ? (
              <button
                onClick={openConnectModal}
                type="button"
                className={`${landing.corner} ${landing.btnPrimary}`}
                style={{ ...baseStyle, color: "#0A0A16", background: "#7C5CFF" }}
              >
                Connect wallet
              </button>
            ) : chain.unsupported ? (
              <button
                onClick={openChainModal}
                type="button"
                className={landing.corner}
                style={{ ...baseStyle, color: "#0A0A16", background: "#FF5C7A" }}
              >
                Wrong network
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={openChainModal}
                  type="button"
                  className={`${landing.corner} ${landing.btnOutline}`}
                  style={{
                    ...baseStyle,
                    color: "#F5F4FB",
                    background: "#151527",
                    border: "1px solid #28283F",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {chain.hasIcon && chain.iconUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={chain.name ?? "Chain icon"}
                      src={chain.iconUrl}
                      style={{ width: 16, height: 16, borderRadius: 4 }}
                    />
                  )}
                  {chain.name}
                </button>
                <button
                  onClick={openAccountModal}
                  type="button"
                  className={`${landing.corner} ${landing.btnTeal}`}
                  style={{ ...baseStyle, color: "#0A0A16", background: "#2FE6D9" }}
                >
                  {account.displayName}
                  {account.displayBalance ? ` (${account.displayBalance})` : ""}
                </button>
              </div>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
