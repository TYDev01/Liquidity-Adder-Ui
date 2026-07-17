"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useAccount } from "wagmi";
import type { Abi, Address } from "viem";
import { erc20Abi } from "@/abis/erc20";

/**
 * Reads an ERC-20/LP allowance from `owner` to `spender`. Works for both plain
 * tokens and LP tokens (identical `allowance` signature).
 */
export function useAllowance(
  token: Address | undefined,
  spender: Address | undefined,
  abi: Abi = erc20Abi as unknown as Abi,
) {
  const publicClient = usePublicClient();
  const { address: account, chainId } = useAccount();

  return useQuery<bigint>({
    queryKey: ["allowance", chainId, token, spender, account],
    enabled: Boolean(publicClient && token && spender && account),
    staleTime: 10_000,
    queryFn: async () => {
      if (!publicClient || !token || !spender || !account) return 0n;
      return (await publicClient.readContract({
        address: token,
        abi,
        functionName: "allowance",
        args: [account, spender],
      })) as bigint;
    },
  });
}
