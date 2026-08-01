"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAdapter } from "@/services/solana/adapters";
import type { SolanaPlatformId } from "@/constants/solana";
import type { SolanaPoolDetail, SolanaPoolSummary } from "@/types/solana";

/**
 * Pool discovery for the selected venue and pair. Read-only, so it runs with or
 * without a connected wallet.
 */
export function useSolanaPools(
  platform: SolanaPlatformId,
  mint: string | undefined,
  quoteMint: string,
) {
  const { connection } = useConnection();

  return useQuery<SolanaPoolSummary[]>({
    queryKey: ["solana-pools", platform, mint, quoteMint],
    enabled: Boolean(mint) && mint !== quoteMint,
    queryFn: () =>
      getAdapter(platform).findPools(
        { connection },
        { mint: mint!, quoteMint },
      ),
    retry: 1,
    staleTime: 30_000,
  });
}

/**
 * Live on-chain state and the connected wallet's positions for one pool. Keyed
 * on the wallet so positions reload on account switch.
 */
export function useSolanaPoolDetail(summary: SolanaPoolSummary | undefined) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const owner = publicKey?.toBase58();

  return useQuery<SolanaPoolDetail>({
    queryKey: ["solana-pool-detail", summary?.platform, summary?.id, owner],
    enabled: Boolean(summary),
    queryFn: () =>
      getAdapter(summary!.platform).loadPool(
        { connection, owner: publicKey ?? undefined },
        summary!,
      ),
    retry: 1,
    // Reserves and positions move constantly; keep this fresher than discovery.
    staleTime: 10_000,
  });
}
