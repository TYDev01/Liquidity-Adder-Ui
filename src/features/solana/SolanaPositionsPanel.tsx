"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, RefreshCw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SolanaRemoveLiquidityForm } from "./SolanaRemoveLiquidityForm";
import { SettingsPopover } from "@/features/liquidity/SettingsPopover";
import { useSolanaWalletPositions } from "@/hooks/useSolanaPositions";
import { useSolanaPoolDetail } from "@/hooks/useSolanaPools";
import { getPlatformConfig } from "@/constants/solana";
import type {
  SolanaPoolSummary,
  SolanaTokenInfo,
  SolanaWalletPosition,
} from "@/types/solana";
import { describeRange } from "@/services/solana/adapters/shared";
import { formatCompact, formatPercent, formatUsd } from "@/utils/format";
import { parseSolanaError } from "@/utils/solanaErrors";
import { cn } from "@/lib/utils";

/**
 * "Your positions" — every position the connected wallet holds, at any venue.
 *
 * The pool-by-pool flow can only reach a withdrawal if the user still knows
 * which token and venue they deposited into. This lists them directly, and
 * expands a row into the existing withdrawal form.
 */
export function SolanaPositionsPanel() {
  const query = useSolanaWalletPositions();
  const [expandedId, setExpandedId] = React.useState<string>();

  const positions = query.data?.positions ?? [];
  const failed = query.data?.failed ?? [];

  if (query.isLoading) {
    return (
      <section className="space-y-2 rounded-3xl border border-border bg-card/40 p-4">
        <Header count={undefined} onRefresh={() => void query.refetch()} busy />
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
      </section>
    );
  }

  if (query.isError) {
    return (
      <Alert tone="danger" title="Couldn't load your positions">
        {parseSolanaError(query.error).message}
      </Alert>
    );
  }

  return (
    <section className="space-y-3 rounded-3xl border border-border bg-card/40 p-4">
      <Header
        count={positions.length}
        onRefresh={() => void query.refetch()}
        busy={query.isFetching}
      />

      {positions.length === 0 ? (
        <p className="px-1 pb-1 text-sm text-muted-foreground">
          This wallet holds no liquidity at any supported venue. Deposits made
          here will show up in this list.
        </p>
      ) : (
        <div className="space-y-2">
          {positions.map((entry) => (
            <PositionRow
              key={`${entry.pool.id}-${entry.position.id}`}
              entry={entry}
              expanded={entry.position.id === expandedId}
              onToggle={() =>
                setExpandedId(
                  entry.position.id === expandedId ? undefined : entry.position.id,
                )
              }
              onRemoved={() => {
                setExpandedId(undefined);
                void query.refetch();
              }}
            />
          ))}
        </div>
      )}

      {failed.length > 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          Couldn&apos;t reach{" "}
          {failed.map((f) => getPlatformConfig(f.platform).name).join(", ")} —
          positions there aren&apos;t listed.
        </p>
      )}
    </section>
  );
}

function Header({
  count,
  onRefresh,
  busy,
}: {
  count: number | undefined;
  onRefresh: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <h2 className="text-sm font-semibold">
        Your positions
        {count !== undefined && count > 0 && (
          <span className="ml-1.5 text-muted-foreground">({count})</span>
        )}
      </h2>
      <div className="flex items-center gap-1">
        <SettingsPopover />
        <button
          onClick={onRefresh}
          disabled={busy}
          aria-label="Refresh positions"
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
        </button>
      </div>
    </div>
  );
}

function PositionRow({
  entry,
  expanded,
  onToggle,
  onRemoved,
}: {
  entry: SolanaWalletPosition;
  expanded: boolean;
  onToggle: () => void;
  onRemoved: () => void;
}) {
  const { pool, position } = entry;
  const config = getPlatformConfig(pool.platform);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border transition-colors",
        expanded ? "border-primary/60 bg-primary/5" : "border-border bg-background/40",
      )}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">
              {pool.symbolA}/{pool.symbolB}
            </span>
            <Badge tone="default">{config.name}</Badge>
            <Badge tone="default">{(pool.feeBps / 100).toFixed(2)}%</Badge>
            {position.inRange === false && <Badge tone="warning">Out of range</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            <PositionDetail entry={entry} />
          </p>
        </div>

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/60 p-3">
              <RemovePanel entry={entry} onRemoved={onRemoved} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The one line of substance under the pair — whatever the venue could tell us. */
function PositionDetail({ entry }: { entry: SolanaWalletPosition }) {
  const { pool, position } = entry;

  if (position.amountA > 0n || position.amountB > 0n) {
    return (
      <>
        {formatCompact(Number(position.amountA) / 10 ** pool.decimalsA)}{" "}
        {pool.symbolA} ·{" "}
        {formatCompact(Number(position.amountB) / 10 ** pool.decimalsB)}{" "}
        {pool.symbolB}
        {pool.tvlUsd ? ` · pool ${formatUsd(pool.tvlUsd)}` : ""}
      </>
    );
  }

  if (position.lowerPrice !== undefined && position.upperPrice !== undefined) {
    return (
      <>
        {describeRange(position.lowerPrice, position.upperPrice, pool.symbolB)}
        {pool.tvlUsd ? ` · pool ${formatUsd(pool.tvlUsd)}` : ""}
      </>
    );
  }

  return (
    <>
      {position.poolShare !== undefined
        ? `${formatPercent(position.poolShare * 100, 3)} of pool`
        : "Liquidity position"}
      {pool.tvlUsd ? ` · pool ${formatUsd(pool.tvlUsd)}` : ""}
    </>
  );
}

/**
 * Loads the pool's live state, then hands off to the shared withdrawal form.
 * Discovery deliberately skips the per-pool reads that pricing needs, so they
 * happen here — once, and only for the position being acted on.
 */
function RemovePanel({
  entry,
  onRemoved,
}: {
  entry: SolanaWalletPosition;
  onRemoved: () => void;
}) {
  const detailQuery = useSolanaPoolDetail(entry.pool);

  if (detailQuery.isLoading) {
    return <Skeleton className="h-48 w-full rounded-2xl" />;
  }

  if (detailQuery.isError) {
    return (
      <Alert tone="danger" title="Couldn't read pool state">
        {parseSolanaError(detailQuery.error).message}
      </Alert>
    );
  }

  const pool = detailQuery.data;
  if (!pool) return null;

  if (pool.positions.length === 0) {
    return (
      <Alert tone="info" title="Nothing left to withdraw">
        This position is no longer on-chain — it may have been closed already.
      </Alert>
    );
  }

  return (
    <SolanaRemoveLiquidityForm
      platform={pool.platform}
      pool={pool}
      token={tokenFromSummary(pool, "A")}
      quoteAsset={tokenFromSummary(pool, "B")}
      initialPositionId={entry.position.id}
      onSuccess={onRemoved}
    />
  );
}

/**
 * The withdrawal form is written against `SolanaTokenInfo`, but a pool summary
 * already carries everything it reads (mint, symbol, decimals) — so no mint
 * lookup is needed to open a position from this list.
 */
function tokenFromSummary(
  pool: SolanaPoolSummary,
  side: "A" | "B",
): SolanaTokenInfo {
  const isA = side === "A";
  return {
    mint: isA ? pool.mintA : pool.mintB,
    name: isA ? pool.symbolA : pool.symbolB,
    symbol: isA ? pool.symbolA : pool.symbolB,
    decimals: isA ? pool.decimalsA : pool.decimalsB,
    supply: 0n,
    isToken2022: false,
    hasMintAuthority: false,
    hasFreezeAuthority: false,
  };
}
