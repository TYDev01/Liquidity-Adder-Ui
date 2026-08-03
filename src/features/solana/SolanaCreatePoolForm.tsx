"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StatRow } from "@/components/ui/stat-row";
import { AmountField } from "@/components/AmountField";
import { SolanaTransactionStatus } from "./SolanaTransactionStatus";
import type { SolanaTokenInfo } from "@/types/solana";
import {
  POOL_CREATION_COST_SOL,
  defaultFeeTier,
  getPlatformConfig,
  type SolanaPlatformId,
} from "@/constants/solana";
import { useSolanaLiquidityActions } from "@/hooks/useSolanaLiquidity";
import {
  findUnsupportedMint,
  unsupportedMintMessage,
  type UnsupportedMint,
} from "@/services/solana/mintSupport";
import { useSettingsStore } from "@/features/liquidity/settingsStore";
import { orderMints, toBaseUnits, toUiAmount } from "@/services/solana/adapters/shared";
import { formatNumber } from "@/utils/format";
import { cn } from "@/lib/utils";

/**
 * Pool creation.
 *
 * The two deposit amounts set the opening price — there is no market to quote
 * against yet — so this form deliberately makes that consequence explicit
 * rather than presenting it as an ordinary deposit.
 */
export function SolanaCreatePoolForm({
  platform,
  token,
  quoteAsset,
  onBack,
  onSuccess,
}: {
  platform: SolanaPlatformId;
  token: SolanaTokenInfo;
  quoteAsset: SolanaTokenInfo;
  onBack: () => void;
  onSuccess?: () => void;
}) {
  const config = getPlatformConfig(platform);
  const slippagePercent = useSettingsStore((s) => s.slippagePercent);
  const actions = useSolanaLiquidityActions(platform);
  const { connection } = useConnection();

  // Whether the venue's program will accept these mints at all. Checked here
  // rather than at submit time so the user isn't asked to sign a doomed
  // transaction — Token-2022 extensions are rejected on-chain, not refunded.
  const [blockedMint, setBlockedMint] = React.useState<UnsupportedMint>();

  React.useEffect(() => {
    let cancelled = false;
    setBlockedMint(undefined);

    findUnsupportedMint(connection, platform, [token, quoteAsset])
      .then((blocked) => {
        if (!cancelled) setBlockedMint(blocked);
      })
      // A failed lookup must not block a pool the venue would have accepted;
      // the adapter re-checks before building.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [connection, platform, token, quoteAsset]);

  const [tokenText, setTokenText] = React.useState("");
  const [quoteText, setQuoteText] = React.useState("");
  const [tierKey, setTierKey] = React.useState(
    () => defaultFeeTier(config).tierKey,
  );

  const tokenAmount = toBaseUnits(tokenText, token.decimals);
  const quoteAmount = toBaseUnits(quoteText, quoteAsset.decimals);

  const openingPrice =
    tokenAmount > 0n && quoteAmount > 0n
      ? toUiAmount(quoteAmount, quoteAsset.decimals) /
        toUiAmount(tokenAmount, token.decimals)
      : 0;

  const insufficientToken =
    token.balance !== undefined && tokenAmount > token.balance;
  const insufficientQuote =
    quoteAsset.balance !== undefined && quoteAmount > quoteAsset.balance;

  const disabled =
    !actions.ready ||
    actions.isBusy ||
    tokenAmount <= 0n ||
    quoteAmount <= 0n ||
    insufficientToken ||
    insufficientQuote ||
    blockedMint !== undefined;

  async function submit() {
    // Pools key on a canonical mint ordering, which may reverse the sides the
    // user sees.
    const { flipped } = orderMints(token.mint, quoteAsset.mint);

    const signatures = await actions.createPool({
      tokenA: flipped ? quoteAsset : token,
      tokenB: flipped ? token : quoteAsset,
      amountA: flipped ? quoteAmount : tokenAmount,
      amountB: flipped ? tokenAmount : quoteAmount,
      tierKey,
      slippagePercent,
      token,
    });

    if (signatures) onSuccess?.();
  }

  if (!config.supportsCreate) {
    return (
      <div className="space-y-4">
        <BackButton onClick={onBack} />
        <Alert tone="warning" title="Pool creation isn't available here">
          {config.name} gates new pools behind an allowlisted config account, so
          they can&apos;t be created from this app. Create the pool on
          Meteora&apos;s own interface, then return here to add liquidity.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BackButton onClick={onBack} />

      {blockedMint && (
        <Alert tone="danger" title={`${config.name} can't host ${blockedMint.symbol}`}>
          {unsupportedMintMessage(platform, blockedMint)}
        </Alert>
      )}

      <Alert tone="warning" title="You're setting the opening price">
        No {token.symbol}/{quoteAsset.symbol} pool exists on {config.name}. The
        ratio you deposit becomes the pool&apos;s starting price — if it differs
        from the wider market, arbitrage traders will correct it at your expense.
      </Alert>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Fee tier
        </label>
        <div className="flex flex-wrap gap-2">
          {config.feeTiers.map((tier) => (
            <button
              key={tier.tierKey}
              type="button"
              onClick={() => setTierKey(tier.tierKey)}
              disabled={actions.isBusy}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
                tier.tierKey === tierKey
                  ? "border-primary/60 bg-primary/10"
                  : "border-border bg-background/60 hover:border-primary/50",
              )}
            >
              {tier.label}
            </button>
          ))}
        </div>
      </div>

      <AmountField
        label="Initial deposit"
        symbol={token.symbol}
        logoURI={token.logoURI}
        decimals={token.decimals}
        balance={token.balance}
        value={tokenText}
        onChange={setTokenText}
        disabled={actions.isBusy}
        invalid={insufficientToken}
      />

      <AmountField
        label="Initial deposit"
        symbol={quoteAsset.symbol}
        logoURI={quoteAsset.logoURI}
        decimals={quoteAsset.decimals}
        balance={quoteAsset.balance}
        value={quoteText}
        onChange={setQuoteText}
        disabled={actions.isBusy}
        invalid={insufficientQuote}
      />

      <div className="divide-y divide-border/60 rounded-2xl border border-border bg-background/40 px-4 py-2">
        <StatRow
          label="Opening price"
          value={
            openingPrice > 0
              ? `${formatNumber(openingPrice, 6)} ${quoteAsset.symbol}/${token.symbol}`
              : "—"
          }
        />
        <StatRow
          label="Estimated network cost"
          value={`~${POOL_CREATION_COST_SOL[platform]} SOL`}
          hint="Rent for the pool's accounts plus protocol fees. Your wallet shows the exact amount."
        />
      </div>

      {(insufficientToken || insufficientQuote) && (
        <Alert tone="danger" title="Insufficient balance">
          You don&apos;t hold enough{" "}
          {insufficientToken ? token.symbol : quoteAsset.symbol} for this deposit.
        </Alert>
      )}

      <Button
        size="lg"
        className="w-full"
        disabled={disabled}
        loading={actions.isBusy}
        onClick={submit}
      >
        {!actions.ready ? "Connect a Solana wallet" : `Create pool on ${config.family}`}
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

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to pools
    </button>
  );
}
