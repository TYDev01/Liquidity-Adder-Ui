"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatRow } from "@/components/ui/stat-row";
import { Skeleton } from "@/components/ui/skeleton";
import type { PoolInfo, TokenInfo } from "@/types";
import { getChainConfig } from "@/constants/dex";
import { estimateTvlEth } from "@/services/uniswap/uniswapService";
import {
  formatNumber,
  formatTokenAmount,
  formatUsd,
  shortenAddress,
} from "@/utils/format";
import { addressUrl } from "@/utils/explorer";

/** Displays the current state of the token/WETH pool. */
export function PoolInfoCard({
  pool,
  token,
  nativeUsd,
  loading,
}: {
  pool?: PoolInfo;
  token: TokenInfo;
  nativeUsd?: number;
  loading?: boolean;
}) {
  const { wrappedSymbol, nativeCurrency, chainId } = getChainConfig(token.chainId);

  if (loading || !pool) {
    return (
      <div className="space-y-2 rounded-2xl border border-border bg-background/40 p-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!pool.exists) {
    return (
      <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-5">
        <div className="flex items-center gap-2">
          <Badge tone="warning">No pool</Badge>
          <p className="text-sm font-medium">No liquidity pool exists yet</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          You&apos;ll be the first liquidity provider. The amounts you deposit
          set the initial price.
        </p>
      </div>
    );
  }

  const tvlEth = estimateTvlEth(pool);
  const tvlUsd = nativeUsd ? tvlEth * nativeUsd : undefined;

  return (
    <div className="rounded-2xl border border-border bg-background/40 p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Pool overview</p>
        <Badge tone="success">Active pool</Badge>
      </div>

      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <StatRow
          label={`${token.symbol} reserve`}
          value={formatTokenAmount(pool.reserveToken, token.decimals, 2)}
        />
        <StatRow
          label={`${wrappedSymbol} reserve`}
          value={formatTokenAmount(pool.reserveWeth, 18, 4)}
        />
        <StatRow
          label={`Price`}
          value={`${formatNumber(pool.priceInEth, 8)} ${nativeCurrency.symbol}`}
          hint={`1 ${token.symbol} in ${nativeCurrency.symbol}`}
        />
        <StatRow
          label="TVL (est.)"
          value={
            tvlUsd !== undefined
              ? formatUsd(tvlUsd + 800)
              : `${formatNumber(tvlEth, 4)} ${nativeCurrency.symbol}`
          }
        />
        {pool.lpBalance !== undefined && (
          <StatRow
            label="Your LP balance"
            value={formatTokenAmount(pool.lpBalance, 18, 6)}
          />
        )}
      </div>

      <a
        href={addressUrl(chainId, pool.pairAddress)}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
      >
        Pool: {shortenAddress(pool.pairAddress, 6)}
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
