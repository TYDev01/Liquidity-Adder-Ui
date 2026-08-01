"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatRow } from "@/components/ui/stat-row";
import { Slider } from "@/components/ui/slider";
import { SolanaTransactionStatus } from "./SolanaTransactionStatus";
import type {
  SolanaPoolDetail,
  SolanaPosition,
  SolanaTokenInfo,
} from "@/types/solana";
import type { SolanaPlatformId } from "@/constants/solana";
import { REMOVE_PRESETS } from "@/constants/app";
import {
  useSolanaLiquidityActions,
  useSolanaRemoveQuote,
} from "@/hooks/useSolanaLiquidity";
import { useSettingsStore } from "@/features/liquidity/settingsStore";
import { describeRange } from "@/services/solana/adapters/shared";
import { formatPercent, formatTokenAmount } from "@/utils/format";
import { parseSolanaError } from "@/utils/solanaErrors";
import { cn } from "@/lib/utils";

/**
 * Withdrawal form.
 *
 * Concentrated and bin venues can hold several positions per pool, each with its
 * own price band, so the position is selected first and the percentage applies
 * to that one position rather than to a single fungible LP balance.
 */
export function SolanaRemoveLiquidityForm({
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
  const slippagePercent = useSettingsStore((s) => s.slippagePercent);
  const actions = useSolanaLiquidityActions(platform);

  const [selectedId, setSelectedId] = React.useState<string | undefined>(
    pool.positions[0]?.id,
  );
  const [percent, setPercent] = React.useState(100);

  const position = React.useMemo(
    () => pool.positions.find((p) => p.id === selectedId) ?? pool.positions[0],
    [pool.positions, selectedId],
  );

  const quoteQuery = useSolanaRemoveQuote({
    pool,
    position,
    fraction: percent / 100,
    slippagePercent,
  });
  const quote = quoteQuery.data;

  const tokenIsA = pool.mintA === token.mint;
  const tokenOut = quote ? (tokenIsA ? quote.amountA : quote.amountB) : 0n;
  const quoteOut = quote ? (tokenIsA ? quote.amountB : quote.amountA) : 0n;

  if (pool.positions.length === 0) {
    return (
      <Alert tone="info" title="No position here">
        You don&apos;t hold liquidity in this pool yet.
      </Alert>
    );
  }

  async function submit() {
    if (!position) return;
    const signatures = await actions.removeLiquidity({
      pool,
      position,
      fraction: percent / 100,
      slippagePercent,
      tokenSymbol: token.symbol,
      mint: token.mint,
    });
    if (signatures) onSuccess?.();
  }

  return (
    <div className="space-y-4">
      {pool.positions.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Position ({pool.positions.length})
          </p>
          {pool.positions.map((candidate) => (
            <button
              key={candidate.id}
              onClick={() => setSelectedId(candidate.id)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors",
                candidate.id === position?.id
                  ? "border-primary/60 bg-primary/10"
                  : "border-border bg-background/40 hover:border-border/80",
              )}
            >
              <span className="text-sm font-medium">
                {describeRange(
                  candidate.lowerPrice,
                  candidate.upperPrice,
                  pool.symbolB,
                )}
              </span>
              {candidate.inRange === false && (
                <Badge tone="warning">Out of range</Badge>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-background/40 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Amount to remove</span>
          <span className="text-2xl font-bold tabular-nums">{percent}%</span>
        </div>

        <Slider value={percent} onValueChange={setPercent} min={1} max={100} />

        <div className="mt-3 flex gap-2">
          {REMOVE_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => setPercent(preset)}
              disabled={actions.isBusy}
              className={cn(
                "flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
                percent === preset
                  ? "border-primary/60 bg-primary/10"
                  : "border-border bg-background/60 hover:border-primary/50",
              )}
            >
              {preset}%
            </button>
          ))}
        </div>
      </div>

      {quote && (
        <div className="divide-y divide-border/60 rounded-2xl border border-border bg-background/40 px-4 py-2">
          <StatRow
            label={`${token.symbol} received`}
            value={formatTokenAmount(tokenOut, token.decimals, 6)}
          />
          <StatRow
            label={`${quoteAsset.symbol} received`}
            value={formatTokenAmount(quoteOut, quoteAsset.decimals, 6)}
          />
          {(quote.feesA ?? 0n) + (quote.feesB ?? 0n) > 0n && (
            <StatRow
              label="Fees claimed"
              value={`${formatTokenAmount(
                tokenIsA ? quote.feesA : quote.feesB,
                token.decimals,
                6,
              )} ${token.symbol}`}
              tone="success"
            />
          )}
          <StatRow label="Max slippage" value={formatPercent(slippagePercent)} />
        </div>
      )}

      {quote?.closesPosition && (
        <Alert tone="info" title="This closes the position">
          Withdrawing everything closes the position account and refunds its
          rent to your wallet.
        </Alert>
      )}

      {quoteQuery.isError && (
        <Alert tone="danger" title="Couldn't price this withdrawal">
          {parseSolanaError(quoteQuery.error).message}
        </Alert>
      )}

      <Button
        size="lg"
        variant="destructive"
        className="w-full"
        disabled={!actions.ready || actions.isBusy || !quote}
        loading={actions.isBusy || quoteQuery.isFetching}
        onClick={submit}
      >
        {!actions.ready
          ? "Connect a Solana wallet"
          : percent === 100
            ? "Close position"
            : `Remove ${percent}%`}
      </Button>

      <SolanaTransactionStatus
        stage={actions.stage}
        signatures={actions.signatures}
        error={actions.error}
        step={actions.step}
        totalSteps={actions.totalSteps}
        stepLabel={actions.stepLabel}
        onDismiss={actions.reset}
      />
    </div>
  );
}
