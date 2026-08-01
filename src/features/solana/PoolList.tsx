"use client";

import * as React from "react";
import { Check, Layers, PlusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { SolanaPoolSummary } from "@/types/solana";
import { formatCompact, formatPercent, formatUsd } from "@/utils/format";
import { cn } from "@/lib/utils";

/**
 * Pools available on the selected venue for the chosen pair.
 *
 * Unlike Uniswap V2 — where a pair address is deterministic and unique — every
 * Solana venue here allows many pools per pair, differing by fee tier and (for
 * concentrated venues) tick spacing. Liquidity is therefore split, and picking
 * the wrong pool means depositing into a dead market. The list is sorted by TVL
 * so the live one is the obvious choice.
 */
export function PoolList({
  pools,
  loading,
  selectedId,
  onSelect,
  onCreate,
  canCreate,
  baseSymbol,
  quoteSymbol,
}: {
  pools: SolanaPoolSummary[];
  loading: boolean;
  selectedId?: string;
  onSelect: (pool: SolanaPoolSummary) => void;
  onCreate: () => void;
  canCreate: boolean;
  baseSymbol: string;
  quoteSymbol: string;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    );
  }

  if (pools.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-background/40 p-6 text-center">
        <Layers className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-semibold">No pool yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          There is no {baseSymbol}/{quoteSymbol} pool on this venue. Creating one
          makes you the first liquidity provider — your deposit ratio sets the
          opening price.
        </p>
        {canCreate && (
          <button
            onClick={onCreate}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <PlusCircle className="h-4 w-4" />
            Create the pool
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          {pools.length} pool{pools.length === 1 ? "" : "s"} found
        </p>
        {canCreate && (
          <button
            onClick={onCreate}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            New pool
          </button>
        )}
      </div>

      {pools.map((pool) => {
        const selected = pool.id === selectedId;
        return (
          <button
            key={pool.id}
            onClick={() => onSelect(pool)}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-2xl border p-3.5 text-left transition-colors",
              selected
                ? "border-primary/60 bg-primary/10"
                : "border-border bg-background/40 hover:border-border/80",
            )}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">
                  {pool.symbolA}/{pool.symbolB}
                </span>
                <Badge tone="default">
                  {(pool.feeBps / 100).toFixed(2)}% fee
                </Badge>
                {pool.tierKey !== undefined && pool.poolModel !== "constant-product" && (
                  <Badge tone="default">
                    {pool.poolModel === "bins"
                      ? `${pool.tierKey} bin step`
                      : `spacing ${pool.tierKey}`}
                  </Badge>
                )}
              </div>
              <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>TVL {pool.tvlUsd ? formatUsd(pool.tvlUsd) : "—"}</span>
                <span>
                  24h vol{" "}
                  {pool.volume24hUsd
                    ? `$${formatCompact(pool.volume24hUsd)}`
                    : "—"}
                </span>
                {pool.apr !== undefined && (
                  <span className="text-success">
                    {formatPercent(pool.apr, 1)} APR
                  </span>
                )}
              </p>
            </div>

            {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}
