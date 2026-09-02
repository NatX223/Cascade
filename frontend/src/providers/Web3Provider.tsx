'use client';

import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from '../config/web3';

// Import RainbowKit styles
import '@rainbow-me/rainbowkit/styles.css'

const queryClient = new QueryClient()

const cascadeTheme = darkTheme({
  accentColor: '#7C5CFF',
  accentColorForeground: '#0A0A16',
  borderRadius: 'medium',
  fontStack: 'system',
});

// `config` sets `ssr: true`, which makes wagmi's hooks safe to call during
// server rendering (they resolve to the disconnected state until the client
// takes over) — so the providers stay mounted unconditionally instead of
// being gated behind a client-only `mounted` flag. Gating them out during
// SSR/static generation would leave descendants calling wagmi hooks with no
// WagmiProvider in the tree, which throws.
export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={cascadeTheme}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}