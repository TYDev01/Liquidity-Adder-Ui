"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useAccount } from "wagmi";
import type { Abi, Address } from "viem";
import type { GasEstimate } from "@/types";
import { BLOCK_TIME_SECONDS } from "@/constants/app";
import { useNativePrice } from "./useNativePrice";

/**
 * Estimates gas for a contract call and enriches it with USD + duration hints.
 * Returns `undefined` (rather than throwing) when the call would revert, so the
 * UI can show "unavailable" without breaking. Guarded by `enabled`.
 */
export function useGasEstimate(params: {
  enabled: boolean;
  address: Address | undefined;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
}) {
  const publicClient = usePublicClient();
  const { address: account, chainId } = useAccount();
  const { data: nativeUsd } = useNativePrice();

  return useQuery<GasEstimate | undefined>({
    queryKey: [
      "gas-estimate",
      chainId,
      params.address,
      params.functionName,
      params.args.map(String).join(","),
      params.value?.toString(),
      nativeUsd,
    ],
    enabled: Boolean(
      params.enabled && publicClient && account && params.address,
    ),
    staleTime: 12_000,
    retry: false,
    queryFn: async () => {
      if (!publicClient || !account || !params.address) return undefined;
      try {
        const [gasLimit, fees] = await Promise.all([
          publicClient.estimateContractGas({
            account,
            address: params.address,
            abi: params.abi,
            functionName: params.functionName,
            args: params.args,
            value: params.value,
          }),
          publicClient.estimateFeesPerGas(),
        ]);

        const maxFeePerGas =
          fees.maxFeePerGas ?? fees.gasPrice ?? 0n;
        const costWei = gasLimit * maxFeePerGas;
        const costEth = Number(costWei) / 1e18;
        const costUsd = nativeUsd ? costEth * nativeUsd : undefined;
        const blockTime = chainId != null ? BLOCK_TIME_SECONDS[chainId] : undefined;

        return {
          gasLimit,
          maxFeePerGas,
          costWei,
          costEth,
          costUsd,
          estimatedSeconds: blockTime ? blockTime * 2 : undefined,
        };
      } catch {
        return undefined;
      }
    },
  });
}
