"use client";

import { Droplets } from "lucide-react";
import { ConnectButton } from "@/features/wallet/ConnectButton";
import { SolanaConnectButton } from "@/features/wallet/SolanaConnectButton";
import { NetworkIndicator } from "@/features/wallet/NetworkIndicator";
import { useEcosystemStore } from "@/features/ecosystem/store";
import { useMounted } from "@/hooks/useMounted";
import { APP_NAME } from "@/constants/app";

export function Header() {
  const mounted = useMounted();
  const ecosystem = useEcosystemStore((s) => s.ecosystem);

  // Until hydrated the persisted ecosystem is unknown — render the EVM stack so
  // server and client markup agree.
  const isSolana = mounted && ecosystem === "solana";

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/30">
            <Droplets className="h-5 w-5 text-white" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-tight sm:text-base">
              {APP_NAME}
            </p>
            <p className="hidden text-xs text-muted-foreground sm:block">
              {isSolana
                ? "Liquidity for any SPL token"
                : "Liquidity for any ERC-20"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isSolana ? (
            <SolanaConnectButton />
          ) : (
            <>
              <NetworkIndicator />
              <ConnectButton />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
