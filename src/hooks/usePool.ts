"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useAccount } from "wagmi";
import type { Address } from "viem";
import { getPoolInfo } from "@/services/uniswap/uniswapService";
import type { PoolInfo } from "@/types";

/**
 * Detects and reads the token/WETH pool for a token. Refetches periodically so
 * reserves and the user's LP balance stay reasonably fresh.
 */
export function usePool(token: Address | undefined) {
  const publicClient = usePublicClient();
  const { address: account, chainId } = useAccount();

  return useQuery<PoolInfo>({
    queryKey: ["pool", chainId, token, account],
    enabled: Boolean(publicClient && token && chainId != null),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!publicClient || !token || chainId == null) {
        throw new Error("Pool query not ready");
      }
      return getPoolInfo(publicClient, chainId, token, account);
    },
  });
}
