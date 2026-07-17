"use client";

import * as React from "react";
import { maxUint256, type Abi } from "viem";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { StatRow } from "@/components/ui/stat-row";
import { TransactionStatus } from "./TransactionStatus";
import type { PoolInfo, TokenInfo } from "@/types";
import { getChainConfig } from "@/constants/dex";
import { uniswapV2PairAbi } from "@/abis/uniswapV2Pair";
import { quoteRemoveLiquidity } from "@/services/uniswap/uniswapService";
import { formatTokenAmount } from "@/utils/format";
import { REMOVE_PRESETS } from "@/constants/app";
import { useSettingsStore } from "@/features/liquidity/settingsStore";
import { useAllowance } from "@/hooks/useAllowance";
import { useApprove } from "@/hooks/useApprove";
import { useRemoveLiquidity } from "@/hooks/useRemoveLiquidity";
import { cn } from "@/lib/utils";

/**
 * Burns a percentage of the user's LP position back into token + ETH. The LP
 * token itself must be approved to the router before removal.
 */
export function RemoveLiquidityForm({
  token,
  pool,
  onSuccess,
}: {
  token: TokenInfo;
  pool: PoolInfo;
  onSuccess?: () => void;
}) {
  const config = getChainConfig(token.chainId);
  const { slippagePercent, deadlineMinutes } = useSettingsStore();
  const [percent, setPercent] = React.useState(50);

  const lpBalance = pool.lpBalance ?? 0n;
  const hasPosition = lpBalance > 0n;

  const liquidity = (lpBalance * BigInt(Math.round(percent * 100))) / 10_000n;

  const quote = React.useMemo(() => {
    if (liquidity === 0n) return undefined;
    return quoteRemoveLiquidity({ pool, liquidity, slippagePercent });
  }, [pool, liquidity, slippagePercent]);

  // LP token → router allowance (uses the pair ABI's allowance/approve).
  const { data: allowance, isLoading: allowanceLoading } = useAllowance(
    pool.pairAddress,
    config.dex.router,
    uniswapV2PairAbi as unknown as Abi,
  );
  const approve = useApprove({
    token: pool.pairAddress,
    spender: config.dex.router,
    tokenSymbol: `${token.symbol} LP`,
    abi: uniswapV2PairAbi as unknown as Abi,
  });
  const remove = useRemoveLiquidity(token);

  const needsApproval =
    quote !== undefined && allowance !== undefined && allowance < quote.liquidity;

  async function handleRemove() {
    if (!quote) return;
    const hash = await remove.removeLiquidity(quote, deadlineMinutes);
    if (hash) onSuccess?.();
  }

  if (!hasPosition) {
    return (
      <Alert tone="info" title="No LP position">
        You don&apos;t hold any LP tokens for this pool yet. Add liquidity first.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-background/40 p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Amount to remove</span>
          <span className="text-3xl font-bold tabular-nums">{percent}%</span>
        </div>
        <Slider value={percent} onValueChange={setPercent} min={1} max={100} />
        <div className="mt-3 flex gap-2">
          {REMOVE_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPercent(p)}
              className={cn(
                "flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors",
                percent === p
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border hover:bg-secondary",
              )}
            >
              {p}%
            </button>
          ))}
        </div>
      </div>

      {quote && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-secondary/30 p-4"
        >
          <p className="mb-1 text-xs font-semibold text-muted-foreground">You will receive (at least)</p>
          <StatRow
            label={token.symbol}
            value={`${formatTokenAmount(quote.amountToken, token.decimals, 4)} (min ${formatTokenAmount(quote.amountTokenMin, token.decimals, 4)})`}
          />
          <StatRow
            label={config.nativeCurrency.symbol}
            value={`${formatTokenAmount(quote.amountEth, 18, 6)} (min ${formatTokenAmount(quote.amountEthMin, 18, 6)})`}
          />
          <StatRow label="LP tokens burned" value={formatTokenAmount(quote.liquidity, 18, 6)} />
        </motion.div>
      )}

      {needsApproval ? (
        <Button
          className="w-full"
          size="lg"
          loading={approve.isBusy}
          disabled={!quote || approve.isBusy}
          onClick={() => approve.approve(maxUint256)}
        >
          {approve.isBusy ? "Approving…" : `Approve ${token.symbol} LP`}
        </Button>
      ) : (
        <Button
          className="w-full"
          size="lg"
          variant="destructive"
          loading={remove.isBusy}
          disabled={!quote || remove.isBusy || allowanceLoading}
          onClick={handleRemove}
        >
          Remove Liquidity
        </Button>
      )}

      <TransactionStatus
        stage={remove.stage !== "idle" ? remove.stage : approve.stage}
        hash={remove.stage !== "idle" ? remove.hash : approve.hash}
        error={remove.error ?? approve.error}
        onDismiss={() => {
          approve.reset();
          remove.reset();
        }}
      />
    </div>
  );
}
