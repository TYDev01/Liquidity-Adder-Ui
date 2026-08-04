"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { allAdapters } from "@/services/solana/adapters";
import { getPlatformConfig } from "@/constants/solana";
import type { SolanaPlatformId } from "@/constants/solana";
import type { SolanaWalletPosition } from "@/types/solana";

/**
 * Every position the connected wallet holds, across every venue.
 *
 * This is the entry point for withdrawing without first knowing which pool you
 * are in — the pool-by-pool path requires pasting the token's mint and picking
 * the right venue, which is only workable if you remember where you deposited.
 *
 * Venues are scanned in parallel and independently: one venue's API being down
 * hides its positions but must not hide the rest, so failures are collected and
 * reported alongside whatever did resolve.
 */

export interface WalletPositionsResult {
  positions: SolanaWalletPosition[];
  /** Venues whose scan failed, so the list can be shown as incomplete. */
  failed: { platform: SolanaPlatformId; message: string }[];
}

export function useSolanaWalletPositions() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const owner = publicKey?.toBase58();

  return useQuery<WalletPositionsResult>({
    queryKey: ["solana-wallet-positions", owner],
    enabled: Boolean(publicKey),
    queryFn: async () => {
      const adapters = allAdapters();
      const results = await Promise.allSettled(
        adapters.map((adapter) =>
          adapter.findOwnerPositions({ connection, owner: publicKey! }),
        ),
      );

      const positions: SolanaWalletPosition[] = [];
      const failed: WalletPositionsResult["failed"] = [];

      results.forEach((result, index) => {
        const platform = adapters[index]!.id;
        if (result.status === "fulfilled") {
          positions.push(...result.value);
        } else {
          failed.push({
            platform,
            message:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          });
        }
      });

      // Largest first, so the position most worth acting on leads.
      positions.sort((a, b) => byValue(b) - byValue(a));
      return { positions, failed };
    },
    // Scanning every venue is expensive; don't repeat it on every focus.
    staleTime: 60_000,
    retry: 1,
  });
}

/** Rough ordering key — TVL isn't per-position, so pool size stands in. */
function byValue(entry: SolanaWalletPosition): number {
  return entry.pool.tvlUsd ?? 0;
}

/** Display name of the venue a position sits at. */
export function platformName(platform: SolanaPlatformId): string {
  return getPlatformConfig(platform).name;
}
