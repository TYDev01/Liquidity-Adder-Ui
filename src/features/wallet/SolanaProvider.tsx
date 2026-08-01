"use client";

import * as React from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { Adapter } from "@solana/wallet-adapter-base";
import { getSolanaRpcUrl, getSolanaWsUrl } from "@/services/solana/connection";

import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Solana wallet stack, mounted alongside (not inside) the wagmi stack.
 *
 * The wallet list is intentionally empty: every wallet we care about (Phantom,
 * Solflare, Backpack, Coinbase, Trust) registers itself through the Wallet
 * Standard, so the adapter discovers them at runtime. Importing the
 * `wallet-adapter-wallets` bundle instead would pull dozens of legacy adapters
 * into the client bundle for no gain.
 */
export function SolanaProvider({ children }: { children: React.ReactNode }) {
  const endpoint = React.useMemo(() => getSolanaRpcUrl(), []);
  const wsEndpoint = React.useMemo(() => getSolanaWsUrl(), []);
  const wallets = React.useMemo<Adapter[]>(() => [], []);

  return (
    <ConnectionProvider
      endpoint={endpoint}
      config={{ commitment: "confirmed", wsEndpoint }}
    >
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
