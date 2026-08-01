"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  fetchQuoteAssetInfo,
  fetchSolanaTokenInfo,
  isValidMint,
} from "@/services/solana/tokenService";
import type { SolanaTokenInfo } from "@/types/solana";

/**
 * Discover an SPL mint. Mirrors `useTokenInfo` on the EVM side: keyed on the
 * mint plus the connected wallet so balances refresh on account switch.
 */
export function useSolanaTokenInfo(mint: string | undefined) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const owner = publicKey?.toBase58();

  return useQuery<SolanaTokenInfo>({
    queryKey: ["solana-token-info", mint, owner],
    enabled: Boolean(mint) && isValidMint(mint),
    queryFn: () => fetchSolanaTokenInfo(connection, mint!, publicKey ?? undefined),
    retry: 1,
    staleTime: 30_000,
  });
}

/** Metadata + balance for the selected quote asset (SOL / USDC / USDT). */
export function useSolanaQuoteAsset(mint: string | undefined) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const owner = publicKey?.toBase58();

  return useQuery<SolanaTokenInfo>({
    queryKey: ["solana-quote-asset", mint, owner],
    enabled: Boolean(mint),
    queryFn: () => fetchQuoteAssetInfo(connection, mint!, publicKey ?? undefined),
    retry: 1,
    staleTime: 30_000,
  });
}
