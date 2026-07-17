"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useAccount } from "wagmi";
import type { Address } from "viem";
import { fetchTokenInfo } from "@/services/token/tokenService";
import type { TokenInfo } from "@/types";
import { normalizeAddress } from "@/utils/validation";

/**
 * Fetches ERC-20 metadata + the connected wallet's balance for a token
 * address. Disabled until a syntactically valid address is supplied.
 */
export function useTokenInfo(rawAddress: string | undefined) {
  const publicClient = usePublicClient();
  const { address: account, chainId } = useAccount();

  const token = rawAddress ? normalizeAddress(rawAddress) : null;

  return useQuery<TokenInfo>({
    queryKey: ["token-info", chainId, token, account],
    enabled: Boolean(publicClient && token),
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      if (!publicClient || !token) throw new Error("Invalid token address");
      return fetchTokenInfo(publicClient, token as Address, account);
    },
  });
}
