"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StatRow } from "@/components/ui/stat-row";
import { AmountField } from "@/components/AmountField";
import { PriceRangeField, type PriceRange } from "./PriceRangeField";
import { SolanaTransactionStatus } from "./SolanaTransactionStatus";
import type {
  SolanaPoolDetail,
  SolanaPosition,
  SolanaTokenInfo,
} from "@/types/solana";
import { getPlatformConfig, type SolanaPlatformId } from "@/constants/solana";
import {
  useSolanaAddQuote,
  useSolanaLiquidityActions,
} from "@/hooks/useSolanaLiquidity";
import { useSettingsStore } from "@/features/liquidity/settingsStore";
import { toBaseUnits, toUiAmount } from "@/services/solana/adapters/shared";
import { formatNumber, formatPercent, formatTokenAmount } from "@/utils/format";
import { parseSolanaError } from "@/utils/solanaErrors";

/**
 * Deposit form.
 *
 * The two amount fields are linked: typing into one asks the venue's adapter to
 * quote the other, because every venue here fixes the deposit ratio from pool
 * state. Concentrated and bin venues additionally take a price band, which
 * changes that ratio — so editing the range re-quotes too.
 */
export function SolanaAddLiquidityForm({
  platform,
  pool,
  token,
  quoteAsset,
  position,
  onSuccess,
}: {
  platform: SolanaPlatformId;
  pool: SolanaPoolDetail;
  token: SolanaTokenInfo;
  quoteAsset: SolanaTokenInfo;
  position?: SolanaPosition;
  onSuccess?: () => void;
}) {
  const config = getPlatformConfig(platform);
  const needsRange = config.poolModel !== "constant-product";

  const slippagePercent = useSettingsStore((s) => s.slippagePercent);
  const actions = useSolanaLiquidityActions(platform);

  // Which side of the pool the pasted token sits on. Pools store mints in a
  // canonical order that may be the reverse of how the user thinks about them.
  const tokenIsA = pool.mintA === token.mint;

  const [inputSide, setInputSide] = React.useState<"A" | "B">(
    tokenIsA ? "A" : "B",
  );
  const [amountText, setAmountText] = React.useState("");

  const [range, setRange] = React.useState<PriceRange>(() => ({
    lowerPrice: pool.price * 0.85,
    upperPrice: pool.price * 1.15,
    isFullRange: !needsRange,
  }));

  const inputDecimals =
    inputSide === "A" ? pool.decimalsA : pool.decimalsB;
  const inputAmount = toBaseUnits(amountText, inputDecimals);

  const quoteQuery = useSolanaAddQuote({
    pool,
    inputSide,
    inputAmount,
    slippagePercent,
    lowerPrice: needsRange && !range.isFullRange ? range.lowerPrice : undefined,
    upperPrice: needsRange && !range.isFullRange ? range.upperPrice : undefined,
    positionId: position?.id,
  });
  const quote = quoteQuery.data;

  // Map A/B back to "the pasted token" and "the asset it's paired with".
  const tokenAmount = quote ? (tokenIsA ? quote.amountA : quote.amountB) : 0n;
  const quoteAmount = quote ? (tokenIsA ? quote.amountB : quote.amountA) : 0n;

  const tokenSideIsInput = (inputSide === "A") === tokenIsA;

  const insufficientToken =
    token.balance !== undefined && tokenAmount > token.balance;
  const insufficientQuote =
    quoteAsset.balance !== undefined && quoteAmount > quoteAsset.balance;

  const rangeInvalid =
    needsRange &&
    !range.isFullRange &&
    (!(range.lowerPrice > 0) || !(range.upperPrice > range.lowerPrice));

  const disabled =
    !actions.ready ||
    actions.isBusy ||
    inputAmount <= 0n ||
    !quote ||
    rangeInvalid ||
    insufficientToken ||
    insufficientQuote;

  async function submit() {
    if (!quote) return;
    const signatures = await actions.addLiquidity({
      pool,
      quote,
      slippagePercent,
      positionId: position?.id,
      tokenSymbol: token.symbol,
      mint: token.mint,
    });
    if (signatures) {
      setAmountText("");
      onSuccess?.();
    }
  }

  function setMax(side: "token" | "quote") {
    const asset = side === "token" ? token : quoteAsset;
    if (asset.balance === undefined) return;

    // Native SOL needs a buffer left over for fees and rent.
    const isNativeSol = asset.symbol === "SOL";
    const spendable = isNativeSol
      ? asset.balance > 20_000_000n
        ? asset.balance - 20_000_000n
        : 0n
      : asset.balance;

    setInputSide(side === "token" ? (tokenIsA ? "A" : "B") : tokenIsA ? "B" : "A");
    setAmountText(String(toUiAmount(spendable, asset.decimals)));
  }

  return (
    <div className="space-y-4">
      <AmountField
        label={tokenSideIsInput ? "You deposit" : "Required"}
        symbol={token.symbol}
        logoURI={token.logoURI}
        decimals={token.decimals}
        balance={token.balance}
        value={
          tokenSideIsInput ? amountText : formatFieldValue(tokenAmount, token.decimals)
        }
        onChange={(value) => {
          setInputSide(tokenIsA ? "A" : "B");
          setAmountText(value);
        }}
        onMax={() => setMax("token")}
        disabled={actions.isBusy}
        invalid={insufficientToken}
      />

      <AmountField
        label={!tokenSideIsInput ? "You deposit" : "Required"}
        symbol={quoteAsset.symbol}
        logoURI={quoteAsset.logoURI}
        decimals={quoteAsset.decimals}
        balance={quoteAsset.balance}
        value={
          !tokenSideIsInput
            ? amountText
            : formatFieldValue(quoteAmount, quoteAsset.decimals)
        }
        onChange={(value) => {
          setInputSide(tokenIsA ? "B" : "A");
          setAmountText(value);
        }}
        onMax={() => setMax("quote")}
        disabled={actions.isBusy}
        invalid={insufficientQuote}
      />

      {needsRange && !position && (
        <PriceRangeField
          currentPrice={pool.price}
          value={range}
          onChange={setRange}
          baseSymbol={pool.symbolA}
          quoteSymbol={pool.symbolB}
          disabled={actions.isBusy}
        />
      )}

      {position && needsRange && (
        <Alert tone="info" title="Adding to an existing position">
          This deposit uses that position&apos;s existing price range.
        </Alert>
      )}

      {quote && (
        <div className="divide-y divide-border/60 rounded-2xl border border-border bg-background/40 px-4 py-2">
          <StatRow
            label="Pool price"
            value={`${formatNumber(pool.price, 6)} ${pool.symbolB}/${pool.symbolA}`}
          />
          {quote.poolShare !== undefined && (
            <StatRow
              label="Your pool share"
              value={formatPercent(quote.poolShare * 100, 4)}
            />
          )}
          {quote.lowerPrice !== undefined && quote.upperPrice !== undefined && (
            <StatRow
              label="Active range"
              value={`${formatNumber(quote.lowerPrice, 6)} – ${formatNumber(quote.upperPrice, 6)}`}
            />
          )}
          <StatRow
            label="Max slippage"
            value={formatPercent(slippagePercent)}
            hint="Set this in the settings menu."
          />
        </div>
      )}

      {quote?.warning && (
        <Alert tone="warning" title="Check your range">
          {quote.warning}
        </Alert>
      )}

      {token.transferFeeBps ? (
        <Alert tone="warning" title="This token charges a transfer fee">
          {(token.transferFeeBps / 100).toFixed(2)}% of every transfer is taken
          by the mint, so less than you enter will reach the pool. Raise your
          slippage if the deposit fails.
        </Alert>
      ) : null}

      {quoteQuery.isError && (
        <Alert tone="danger" title="Couldn't price this deposit">
          {parseSolanaError(quoteQuery.error).message}
        </Alert>
      )}

      {(insufficientToken || insufficientQuote) && (
        <Alert tone="danger" title="Insufficient balance">
          You need{" "}
          {insufficientToken
            ? `${formatTokenAmount(tokenAmount, token.decimals, 4)} ${token.symbol}`
            : `${formatTokenAmount(quoteAmount, quoteAsset.decimals, 4)} ${quoteAsset.symbol}`}{" "}
          for this deposit.
        </Alert>
      )}

      <Button
        size="lg"
        className="w-full"
        disabled={disabled}
        loading={actions.isBusy || quoteQuery.isFetching}
        onClick={submit}
      >
        {!actions.ready
          ? "Connect a Solana wallet"
          : position
            ? "Add to position"
            : "Add liquidity"}
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

/** Render a derived (non-edited) amount without fighting the user's cursor. */
function formatFieldValue(amount: bigint, decimals: number): string {
  if (amount <= 0n) return "";
  return String(Number(toUiAmount(amount, decimals).toPrecision(9)));
}
