"use client";

import { useCallback } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import type { Abi } from "viem";
import { uniswapV2RouterAbi } from "@/abis/uniswapV2Router";
import { getChainConfig } from "@/constants/dex";
import { deadlineFromNow } from "@/services/uniswap/uniswapService";
import type { RemoveLiquidityQuote, TokenInfo } from "@/types";
import { useTransactionRunner } from "./useTransactionRunner";

/**
 * Executes `removeLiquidityETH` on the configured router, burning LP tokens for
 * the underlying token + ETH. The LP token must already be approved to the
 * router (handled by the UI's approval step).
 */
export function useRemoveLiquidity(token: TokenInfo | undefined) {
  const runner = useTransactionRunner();
  const { address: account, chainId } = useAccount();
  const queryClient = useQueryClient();

  const removeLiquidity = useCallback(
    async (quote: RemoveLiquidityQuote, deadlineMinutes: number) => {
      if (!token || chainId == null || !account) return undefined;
      const { dex } = getChainConfig(chainId);

      const hash = await runner.run({
        address: dex.router,
        abi: uniswapV2RouterAbi as unknown as Abi,
        functionName: "removeLiquidityETH",
        args: [
          token.address,
          quote.liquidity,
          quote.amountTokenMin,
          quote.amountEthMin,
          account, // recipient of token + ETH
          deadlineFromNow(deadlineMinutes),
        ],
        action: "remove",
        tokenSymbol: token.symbol,
        tokenAddress: token.address,
      });

      if (hash) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["pool"] }),
          queryClient.invalidateQueries({ queryKey: ["token-info"] }),
          queryClient.invalidateQueries({ queryKey: ["allowance"] }),
        ]);
      }
      return hash;
    },
    [token, chainId, account, runner, queryClient],
  );

  return { ...runner, removeLiquidity };
}
