"use client";

import { useCallback } from "react";
import { maxUint256, type Abi, type Address } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi } from "@/abis/erc20";
import { useTransactionRunner } from "./useTransactionRunner";

/**
 * Approves a spender to move a token/LP token. Defaults to an unlimited
 * approval, but a finite amount can be passed for users who prefer it.
 */
export function useApprove(params: {
  token: Address | undefined;
  spender: Address | undefined;
  tokenSymbol: string;
  abi?: Abi;
}) {
  const runner = useTransactionRunner();
  const queryClient = useQueryClient();

  const approve = useCallback(
    async (amount: bigint = maxUint256) => {
      if (!params.token || !params.spender) return undefined;
      const hash = await runner.run({
        address: params.token,
        abi: (params.abi ?? (erc20Abi as unknown as Abi)),
        functionName: "approve",
        args: [params.spender, amount],
        action: "approve",
        tokenSymbol: params.tokenSymbol,
        tokenAddress: params.token,
      });
      if (hash) {
        // Refresh allowance reads once confirmed.
        await queryClient.invalidateQueries({ queryKey: ["allowance"] });
      }
      return hash;
    },
    [params.token, params.spender, params.abi, params.tokenSymbol, runner, queryClient],
  );

  return { ...runner, approve };
}
