"use client";

import * as React from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { wagmiConfig } from "@/services/blockchain/wagmi";
import { SolanaProvider } from "@/features/wallet/SolanaProvider";

import "@rainbow-me/rainbowkit/styles.css";

/**
 * Client-side provider stack: wagmi (chains/transports/connectors) →
 * React Query (async cache) → RainbowKit (wallet UI) → Solana wallet adapter.
 * Instantiated once.
 *
 * Both ecosystems' wallet stacks are mounted together rather than swapped with
 * the active ecosystem: they hold independent connections, and unmounting one
 * on every toggle would drop it and force a reconnect.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 15_000,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#7c5cff",
            accentColorForeground: "white",
            borderRadius: "large",
            overlayBlur: "small",
          })}
        >
          <SolanaProvider>{children}</SolanaProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
