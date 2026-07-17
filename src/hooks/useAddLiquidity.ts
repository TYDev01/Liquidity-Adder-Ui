"use client";

import { useCallback } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import type { Abi } from "viem";
import { uniswapV2RouterAbi } from "@/abis/uniswapV2Router";
import { getChainConfig } from "@/constants/dex";
import { deadlineFromNow } from "@/services/uniswap/uniswapService";
import type { AddLiquidityQuote, TokenInfo } from "@/types";
import { useTransactionRunner } from "./useTransactionRunner";

/**
 * Executes `addLiquidityETH` on the configured router. Handles both the
 * pool-creation (initial mint) and add-to-existing cases — the router treats
 * them identically, differing only in the min amounts derived from the quote.
 */
export function useAddLiquidity(token: TokenInfo | undefined) {
  const runner = useTransactionRunner();
  const { address: account, chainId } = useAccount();
  const queryClient = useQueryClient();

  const addLiquidity = useCallback(
    async (quote: AddLiquidityQuote, deadlineMinutes: number) => {
      if (!token || chainId == null || !account) return undefined;
      const { dex } = getChainConfig(chainId);

      const hash = await runner.run({
        address: dex.router,
        abi: uniswapV2RouterAbi as unknown as Abi,
        functionName: "addLiquidityETH",
        args: [
          token.address,
          quote.amountTokenDesired,
          quote.amountTokenMin,
          quote.amountEthMin,
          account, // LP recipient
          deadlineFromNow(deadlineMinutes),
        ],
        value: quote.amountEthDesired,
        action: quote.isInitialLiquidity ? "create" : "add",
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

  return { ...runner, addLiquidity };
}
