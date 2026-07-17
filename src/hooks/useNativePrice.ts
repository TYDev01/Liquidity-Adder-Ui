"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { fetchNativeUsdPrice } from "@/services/token/priceService";

/** Best-effort USD price of the active chain's native asset (for gas/USD hints). */
export function useNativePrice() {
  const { chainId } = useAccount();
  return useQuery<number | undefined>({
    queryKey: ["native-price", chainId],
    enabled: chainId != null,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () =>
      chainId != null ? fetchNativeUsdPrice(chainId) : undefined,
  });
}
