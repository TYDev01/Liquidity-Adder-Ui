"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EcosystemToggle } from "./EcosystemToggle";
import { LiquidityManager } from "@/features/liquidity/LiquidityManager";
import { SolanaLiquidityManager } from "@/features/solana/SolanaLiquidityManager";
import { useEcosystemStore } from "./store";
import { useMounted } from "@/hooks/useMounted";

/**
 * Top-level shell: the ecosystem switch plus whichever manager it selects.
 *
 * The two managers are entirely separate trees — they share no state, no wallet
 * and no client — so this swaps rather than parameterises.
 */
export function EcosystemManager() {
  const mounted = useMounted();
  const ecosystem = useEcosystemStore((s) => s.ecosystem);

  // The persisted choice isn't known during SSR; render EVM until hydrated so
  // the markup matches.
  const active = mounted ? ecosystem : "evm";

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <EcosystemToggle />

      {active === "solana" ? (
        <Card>
          <CardContent className="p-6">
            <SolanaLiquidityManager />
          </CardContent>
        </Card>
      ) : (
        <LiquidityManager />
      )}
    </div>
  );
}
