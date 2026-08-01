"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { StatRow } from "@/components/ui/stat-row";
import { SettingsPopover } from "@/features/liquidity/SettingsPopover";
import { SolanaAddLiquidityForm } from "./SolanaAddLiquidityForm";
import { SolanaRemoveLiquidityForm } from "./SolanaRemoveLiquidityForm";
import type { SolanaPoolDetail, SolanaTokenInfo } from "@/types/solana";
import type { SolanaPlatformId } from "@/constants/solana";
import { describeRange } from "@/services/solana/adapters/shared";
import { formatCompact, formatPercent, formatUsd } from "@/utils/format";
import { cn } from "@/lib/utils";

/**
 * Tabbed add/remove container for a selected Solana pool, plus a summary of the
 * pool and any positions the wallet already holds in it.
 */
export function SolanaLiquidityPanel({
  platform,
  pool,
  token,
  quoteAsset,
  onSuccess,
}: {
  platform: SolanaPlatformId;
  pool: SolanaPoolDetail;
  token: SolanaTokenInfo;
  quoteAsset: SolanaTokenInfo;
  onSuccess?: () => void;
}) {
  const [tab, setTab] = React.useState<"add" | "remove">("add");
  const hasPosition = pool.positions.length > 0;

  return (
    <div className="space-y-4">
      <PoolSummary pool={pool} />

      {hasPosition && <PositionSummary pool={pool} token={token} quoteAsset={quoteAsset} />}

      <div className="rounded-3xl border border-border bg-card/40 p-1.5">
        <div className="flex items-center justify-between gap-2 p-2">
          <div className="flex rounded-xl bg-secondary/40 p-1">
            <TabButton active={tab === "add"} onClick={() => setTab("add")}>
              Add
            </TabButton>
            <TabButton
              active={tab === "remove"}
              onClick={() => setTab("remove")}
              disabled={!hasPosition}
            >
              Remove
            </TabButton>
          </div>
          <SettingsPopover />
        </div>

        <motion.div
          key={tab}
          initial={{ opacity: 0, x: tab === "add" ? -8 : 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="p-3"
        >
          {tab === "add" ? (
            <SolanaAddLiquidityForm
              platform={platform}
              pool={pool}
              token={token}
              quoteAsset={quoteAsset}
              onSuccess={onSuccess}
            />
          ) : (
            <SolanaRemoveLiquidityForm
              platform={platform}
              pool={pool}
              token={token}
              quoteAsset={quoteAsset}
              onSuccess={onSuccess}
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}

function PoolSummary({ pool }: { pool: SolanaPoolDetail }) {
  return (
    <div className="divide-y divide-border/60 rounded-2xl border border-border bg-background/40 px-4 py-2">
      <StatRow
        label="Pool"
        value={
          <span className="flex items-center gap-2">
            {pool.symbolA}/{pool.symbolB}
            <Badge tone="default">{(pool.feeBps / 100).toFixed(2)}%</Badge>
          </span>
        }
      />
      <StatRow label="TVL" value={pool.tvlUsd ? formatUsd(pool.tvlUsd) : "—"} />
      <StatRow
        label="24h volume"
        value={pool.volume24hUsd ? `$${formatCompact(pool.volume24hUsd)}` : "—"}
      />
      {pool.apr !== undefined && (
        <StatRow label="APR" value={formatPercent(pool.apr, 1)} tone="success" />
      )}
    </div>
  );
}

function PositionSummary({
  pool,
  token,
  quoteAsset,
}: {
  pool: SolanaPoolDetail;
  token: SolanaTokenInfo;
  quoteAsset: SolanaTokenInfo;
}) {
  const tokenIsA = pool.mintA === token.mint;

  return (
    <div className="rounded-2xl border border-border bg-background/40 p-4">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Your position{pool.positions.length > 1 ? "s" : ""}
      </p>
      <div className="space-y-2">
        {pool.positions.map((position) => (
          <div
            key={position.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-secondary/30 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {describeRange(
                  position.lowerPrice,
                  position.upperPrice,
                  pool.symbolB,
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCompact(
                  Number(tokenIsA ? position.amountA : position.amountB) /
                    10 ** token.decimals,
                )}{" "}
                {token.symbol} ·{" "}
                {formatCompact(
                  Number(tokenIsA ? position.amountB : position.amountA) /
                    10 ** quoteAsset.decimals,
                )}{" "}
                {quoteAsset.symbol}
              </p>
            </div>
            {position.inRange === false ? (
              <Badge tone="warning">Out of range</Badge>
            ) : position.poolShare !== undefined ? (
              <Badge tone="default">
                {formatPercent(position.poolShare * 100, 3)}
              </Badge>
            ) : (
              <Badge tone="success">In range</Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TabButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId="solana-tab-pill"
          className="absolute inset-0 rounded-lg bg-background shadow"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}
