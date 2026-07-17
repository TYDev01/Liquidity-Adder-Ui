"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAccount } from "wagmi";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AddressSearchBar } from "@/features/token/AddressSearchBar";
import { TokenInfoCard } from "@/features/token/TokenInfoCard";
import { TokenShortcuts } from "@/features/token/TokenShortcuts";
import { PoolInfoCard } from "@/features/liquidity/PoolInfoCard";
import { LiquidityPanel } from "@/features/liquidity/LiquidityPanel";
import { RecentTransactions } from "@/features/liquidity/RecentTransactions";
import { useTokenInfo } from "@/hooks/useTokenInfo";
import { usePool } from "@/hooks/usePool";
import { useNativePrice } from "@/hooks/useNativePrice";
import { useMounted } from "@/hooks/useMounted";
import { useTokenStore } from "@/features/token/store";
import { isChainSupported } from "@/constants/dex";
import { normalizeAddress } from "@/utils/validation";
import { parseError } from "@/utils/errors";

/**
 * Top-level orchestrator: owns the "active token address" and wires together
 * token discovery, pool detection and the liquidity actions.
 */
export function LiquidityManager() {
  const mounted = useMounted();
  const { isConnected, chainId } = useAccount();
  const addToHistory = useTokenStore((s) => s.addToHistory);

  const [input, setInput] = React.useState("");
  const [activeAddress, setActiveAddress] = React.useState<string>();

  const tokenQuery = useTokenInfo(activeAddress);
  const token = tokenQuery.data;
  const normalized = token ? token.address : undefined;
  const poolQuery = usePool(normalized);
  const { data: nativeUsd } = useNativePrice();

  // Record successful analyses in search history.
  React.useEffect(() => {
    if (token) {
      addToHistory({
        address: token.address,
        chainId: token.chainId,
        symbol: token.symbol,
        name: token.name,
        logoURI: token.logoURI,
        savedAt: Date.now(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token?.address, token?.chainId]);

  function analyze(address: string) {
    const normalizedAddr = normalizeAddress(address);
    if (!normalizedAddr) return;
    setActiveAddress(normalizedAddr);
  }

  function pick(address: string) {
    setInput(address);
    analyze(address);
  }

  const unsupportedChain =
    mounted && isConnected && !isChainSupported(chainId);

  return (
    <div className="mx-auto w-full max-w-lg">
      <Card>
        <CardContent className="space-y-5 p-6">
          <AddressSearchBar
            value={input}
            onChange={setInput}
            onAnalyze={analyze}
            loading={tokenQuery.isFetching}
          />

          <TokenShortcuts onPick={pick} />

          {unsupportedChain && (
            <Alert tone="warning" title="Unsupported network">
              Switch to a supported network to analyse tokens and manage liquidity.
            </Alert>
          )}

          {!mounted || !isConnected ? (
            <Alert tone="info" title="Connect your wallet">
              Connect a wallet to read balances and manage liquidity. You can
              still analyse tokens once connected to a supported network.
            </Alert>
          ) : null}

          {/* Loading skeleton while discovering the token. */}
          {tokenQuery.isFetching && !token && <TokenSkeleton />}

          {/* Token discovery error. */}
          {tokenQuery.isError && (
            <Alert tone="danger" title="Couldn't analyse token">
              {parseError(tokenQuery.error).message}
            </Alert>
          )}

          <AnimatePresence mode="wait">
            {token && !tokenQuery.isFetching && (
              <motion.div
                key={`${token.chainId}-${token.address}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-5"
              >
                <TokenInfoCard token={token} />

                <PoolInfoCard
                  pool={poolQuery.data}
                  token={token}
                  nativeUsd={nativeUsd}
                  loading={poolQuery.isLoading}
                />

                {poolQuery.data && (
                  <LiquidityPanel
                    token={token}
                    pool={poolQuery.data}
                    nativeUsd={nativeUsd}
                    onSuccess={() => poolQuery.refetch()}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <RecentTransactions />
    </div>
  );
}

function TokenSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-background/40 p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
