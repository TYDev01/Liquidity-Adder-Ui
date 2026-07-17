"use client";

import * as React from "react";
import { useAccount, useBalance } from "wagmi";
import { formatUnits, maxUint256, type Abi } from "viem";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { StatRow } from "@/components/ui/stat-row";
import { AmountField } from "@/components/AmountField";
import { TransactionStatus } from "./TransactionStatus";
import type { PoolInfo, TokenInfo } from "@/types";
import { getChainConfig } from "@/constants/dex";
import { uniswapV2RouterAbi } from "@/abis/uniswapV2Router";
import { erc20Abi } from "@/abis/erc20";
import { quoteAddLiquidity } from "@/services/uniswap/uniswapService";
import { priceImpact } from "@/utils/liquidityMath";
import { toWei, formatTokenAmount, formatNumber, formatPercent, formatUsd, formatDuration } from "@/utils/format";
import { validateAmountInput } from "@/utils/validation";
import { HIGH_SLIPPAGE_WARNING_PERCENT } from "@/constants/app";
import { useSettingsStore } from "@/features/liquidity/settingsStore";
import { useAllowance } from "@/hooks/useAllowance";
import { useApprove } from "@/hooks/useApprove";
import { useAddLiquidity } from "@/hooks/useAddLiquidity";
import { useGasEstimate } from "@/hooks/useGasEstimate";

/**
 * Handles both "create liquidity" (empty pool) and "add liquidity" (existing
 * pool). For an existing pool the ETH side is derived from the token amount to
 * preserve the pool ratio; for a new pool the user sets both sides freely.
 */
export function AddLiquidityForm({
  token,
  pool,
  nativeUsd,
  onSuccess,
}: {
  token: TokenInfo;
  pool: PoolInfo;
  nativeUsd?: number;
  onSuccess?: () => void;
}) {
  const { address: account, chainId } = useAccount();
  const config = getChainConfig(token.chainId);
  const { slippagePercent, deadlineMinutes } = useSettingsStore();

  const { data: ethBalance } = useBalance({ address: account });

  const [tokenAmount, setTokenAmount] = React.useState("");
  const [ethAmount, setEthAmount] = React.useState("");

  const isInitial = !pool.exists || pool.totalSupply === 0n;

  const tokenError = validateAmountInput(tokenAmount, token.decimals);
  const ethError = validateAmountInput(ethAmount, 18);

  // Derive the quote whenever inputs change.
  const quote = React.useMemo(() => {
    const amountTokenDesired = tokenError ? 0n : toWei(tokenAmount, token.decimals);
    const amountEthDesired = ethError ? 0n : toWei(ethAmount, 18);
    if (amountTokenDesired === 0n) return undefined;
    if (isInitial && amountEthDesired === 0n) return undefined;
    return quoteAddLiquidity({
      pool,
      amountTokenDesired,
      amountEthDesired,
      slippagePercent,
    });
  }, [tokenAmount, ethAmount, tokenError, ethError, token.decimals, pool, isInitial, slippagePercent]);

  // For existing pools, reflect the derived ETH amount back into the field.
  // Use `formatUnits` (plain, un-grouped decimal) so the value round-trips
  // cleanly back through `toWei`/validation.
  React.useEffect(() => {
    if (!isInitial && quote) {
      const shown =
        quote.amountEthDesired === 0n
          ? ""
          : formatUnits(quote.amountEthDesired, 18);
      setEthAmount((prev) => (prev === shown ? prev : shown));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.amountEthDesired, isInitial]);

  // Allowance + approval for the token → router.
  const { data: allowance, isLoading: allowanceLoading } = useAllowance(
    token.address,
    config.dex.router,
  );
  const approve = useApprove({
    token: token.address,
    spender: config.dex.router,
    tokenSymbol: token.symbol,
  });
  const add = useAddLiquidity(token);

  const needsApproval =
    quote !== undefined &&
    allowance !== undefined &&
    allowance < quote.amountTokenDesired;

  // Balance checks.
  const insufficientToken =
    quote !== undefined &&
    token.balance !== undefined &&
    quote.amountTokenDesired > token.balance;
  const insufficientEth =
    quote !== undefined &&
    ethBalance !== undefined &&
    quote.amountEthDesired > ethBalance.value;

  // Gas estimate (only meaningful once approved and inputs are valid).
  const gas = useGasEstimate({
    enabled: Boolean(quote && !needsApproval && !insufficientToken && !insufficientEth),
    address: config.dex.router,
    abi: uniswapV2RouterAbi as unknown as Abi,
    functionName: "addLiquidityETH",
    args: quote
      ? [
          token.address,
          quote.amountTokenDesired,
          quote.amountTokenMin,
          quote.amountEthMin,
          account ?? token.address,
          BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60),
        ]
      : [],
    value: quote?.amountEthDesired,
  });

  const impact =
    quote && !isInitial
      ? priceImpact(quote.amountTokenDesired, quote.amountEthDesired, pool.reserveToken, pool.reserveWeth)
      : 0;

  const busy = approve.isBusy || add.isBusy;

  async function handleAdd() {
    if (!quote) return;
    const hash = await add.addLiquidity(quote, deadlineMinutes);
    if (hash) {
      setTokenAmount("");
      setEthAmount("");
      onSuccess?.();
    }
  }

  return (
    <div className="space-y-3">
      <AmountField
        label={`${token.symbol} amount`}
        symbol={token.symbol}
        logoURI={token.logoURI}
        value={tokenAmount}
        onChange={setTokenAmount}
        balance={token.balance}
        decimals={token.decimals}
        invalid={Boolean(tokenError) || insufficientToken}
        onMax={
          token.balance !== undefined
            ? () => setTokenAmount(formatUnits(token.balance!, token.decimals))
            : undefined
        }
      />

      <AmountField
        label={`${config.nativeCurrency.symbol} amount`}
        symbol={config.nativeCurrency.symbol}
        value={ethAmount}
        onChange={setEthAmount}
        balance={ethBalance?.value}
        decimals={18}
        disabled={!isInitial}
        invalid={Boolean(ethError) || insufficientEth}
        onMax={
          isInitial && ethBalance
            ? () => {
                // Leave a small buffer for gas rather than draining the wallet.
                const buffer = 2_000_000_000_000_000n; // 0.002
                const max =
                  ethBalance.value > buffer ? ethBalance.value - buffer : 0n;
                setEthAmount(formatUnits(max, 18));
              }
            : undefined
        }
      />

      {!isInitial && (
        <p className="px-1 text-xs text-muted-foreground">
          The {config.nativeCurrency.symbol} amount is calculated from the pool
          ratio to avoid an unbalanced deposit.
        </p>
      )}

      {tokenError && <Alert tone="danger">{tokenError}</Alert>}
      {ethError && isInitial && <Alert tone="danger">{ethError}</Alert>}
      {insufficientToken && <Alert tone="danger">Insufficient {token.symbol} balance.</Alert>}
      {insufficientEth && <Alert tone="danger">Insufficient {config.nativeCurrency.symbol} balance.</Alert>}

      {quote && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-secondary/30 p-4"
        >
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Preview</p>
          <StatRow label="LP tokens received" value={formatTokenAmount(quote.liquidity, 18, 6)} />
          <StatRow
            label="Share of pool"
            value={formatPercent((quote.poolShare ?? 0) * 100, 4)}
          />
          <StatRow label={`Min ${token.symbol}`} value={formatTokenAmount(quote.amountTokenMin, token.decimals, 4)} />
          <StatRow label={`Min ${config.nativeCurrency.symbol}`} value={formatTokenAmount(quote.amountEthMin, 18, 6)} />
          {!isInitial && (
            <StatRow
              label="Price impact"
              value={formatPercent(impact * 100, 2)}
              tone={impact > 0.05 ? "warning" : "default"}
            />
          )}
          {gas.data && (
            <StatRow
              label="Network fee (est.)"
              value={
                gas.data.costUsd !== undefined
                  ? `${formatUsd(gas.data.costUsd)} · ${formatDuration(gas.data.estimatedSeconds)}`
                  : `${formatNumber(gas.data.costEth, 6)} ${config.nativeCurrency.symbol}`
              }
            />
          )}
        </motion.div>
      )}

      {slippagePercent >= HIGH_SLIPPAGE_WARNING_PERCENT && (
        <Alert tone="warning" title="High slippage">
          Your slippage tolerance is {slippagePercent}%. You may receive a worse rate.
        </Alert>
      )}

      {/* Action buttons: approve first (if needed), then add. */}
      {needsApproval ? (
        <Button
          className="w-full"
          size="lg"
          loading={approve.isBusy}
          disabled={!quote || busy || insufficientToken}
          onClick={() => approve.approve(maxUint256)}
        >
          {approve.isBusy ? "Approving…" : `Approve ${token.symbol}`}
        </Button>
      ) : (
        <Button
          className="w-full"
          size="lg"
          loading={add.isBusy}
          disabled={
            !quote ||
            busy ||
            allowanceLoading ||
            insufficientToken ||
            insufficientEth ||
            Boolean(tokenError) ||
            (isInitial && Boolean(ethError))
          }
          onClick={handleAdd}
        >
          {isInitial ? "Create Liquidity" : "Add Liquidity"}
        </Button>
      )}

      {/* Show the add lifecycle once it starts, otherwise the approval's. */}
      <TransactionStatus
        stage={add.stage !== "idle" ? add.stage : approve.stage}
        hash={add.stage !== "idle" ? add.hash : approve.hash}
        error={add.error ?? approve.error}
        onDismiss={() => {
          approve.reset();
          add.reset();
        }}
      />
    </div>
  );
}
