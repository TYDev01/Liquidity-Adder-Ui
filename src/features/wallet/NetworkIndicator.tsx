"use client";

import { useAccount } from "wagmi";
import { Badge } from "@/components/ui/badge";
import { tryGetChainConfig, isChainSupported } from "@/constants/dex";
import { useMounted } from "@/hooks/useMounted";

/** Small live indicator of the connected network + DEX in use. */
export function NetworkIndicator() {
  const mounted = useMounted();
  const { chainId, isConnected } = useAccount();

  if (!mounted || !isConnected || chainId == null) return null;

  const config = tryGetChainConfig(chainId);
  const supported = isChainSupported(chainId);

  if (!supported || !config) {
    return <Badge tone="danger">Unsupported network</Badge>;
  }

  return (
    <Badge tone="success" className="hidden md:inline-flex">
      <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
      {config.shortName} · {config.dex.name}
    </Badge>
  );
}
