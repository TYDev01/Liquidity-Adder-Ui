"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PlatformPicker } from "./PlatformPicker";
import { QuoteAssetPicker } from "./QuoteAssetPicker";
import { PoolList } from "./PoolList";
import { SolanaTokenInfoCard } from "./SolanaTokenInfoCard";
import { SolanaLiquidityPanel } from "./SolanaLiquidityPanel";
import { SolanaCreatePoolForm } from "./SolanaCreatePoolForm";
import { SolanaRecentTransactions } from "./SolanaRecentTransactions";
import { useEcosystemStore } from "@/features/ecosystem/store";
import {
  useSolanaQuoteAsset,
  useSolanaTokenInfo,
} from "@/hooks/useSolanaTokenInfo";
import { useSolanaPoolDetail, useSolanaPools } from "@/hooks/useSolanaPools";
import { useMounted } from "@/hooks/useMounted";
import { getPlatformConfig } from "@/constants/solana";
import { isValidMint } from "@/services/solana/tokenService";
import { isUsingFallbackRpc } from "@/services/solana/connection";
import { parseSolanaError } from "@/utils/solanaErrors";
import { useWallet } from "@solana/wallet-adapter-react";
import type { SolanaPoolSummary } from "@/types/solana";

/**
 * Solana orchestrator — the counterpart to `LiquidityManager`.
 *
 * The flow is one step longer than on EVM: a Uniswap V2 pair is uniquely
 * determined by its two tokens, whereas every Solana venue here allows many
 * pools per pair (different fee tiers, tick spacings, bin steps). So the user
 * picks a venue and a pairing, and then picks among the pools that exist.
 */
export function SolanaLiquidityManager() {
  const mounted = useMounted();
  const { connected } = useWallet();

  const platform = useEcosystemStore((s) => s.platform);
  const setPlatform = useEcosystemStore((s) => s.setPlatform);
  const quoteMint = useEcosystemStore((s) => s.quoteMint);
  const setQuoteMint = useEcosystemStore((s) => s.setQuoteMint);

  const [input, setInput] = React.useState("");
  const [activeMint, setActiveMint] = React.useState<string>();
  const [selectedPoolId, setSelectedPoolId] = React.useState<string>();
  const [creating, setCreating] = React.useState(false);

  const config = getPlatformConfig(platform);

  const tokenQuery = useSolanaTokenInfo(activeMint);
  const token = tokenQuery.data;
  const quoteQuery = useSolanaQuoteAsset(quoteMint);
  const quoteAsset = quoteQuery.data;

  const poolsQuery = useSolanaPools(platform, token?.mint, quoteMint);
  const poolsData = poolsQuery.data;
  const pools = React.useMemo(() => poolsData ?? [], [poolsData]);

  // Default to the deepest pool whenever the list changes.
  const selectedSummary = React.useMemo<SolanaPoolSummary | undefined>(() => {
    if (pools.length === 0) return undefined;
    return pools.find((p) => p.id === selectedPoolId) ?? pools[0];
  }, [pools, selectedPoolId]);

  const detailQuery = useSolanaPoolDetail(selectedSummary);

  // Changing venue or pairing invalidates the pool selection and the create flow.
  React.useEffect(() => {
    setSelectedPoolId(undefined);
    setCreating(false);
  }, [platform, quoteMint, activeMint]);

  function analyze(value: string) {
    const trimmed = value.trim();
    if (!isValidMint(trimmed)) return;
    setActiveMint(trimmed);
  }

  const inputInvalid = input.trim().length > 0 && !isValidMint(input.trim());
  const samMintAsQuote = token?.mint === quoteMint;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <PlatformPicker value={platform} onChange={setPlatform} />
        <QuoteAssetPicker value={quoteMint} onChange={setQuoteMint} />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Token mint address
        </label>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analyze(input)}
            placeholder="Paste an SPL token mint…"
            aria-invalid={inputInvalid}
            className="font-mono text-sm"
          />
          <Button
            onClick={() => analyze(input)}
            disabled={!isValidMint(input.trim())}
            loading={tokenQuery.isFetching}
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Analyse</span>
          </Button>
        </div>
        {inputInvalid && (
          <p className="mt-1.5 text-xs text-destructive">
            Not a valid Solana mint address. These are base58, not 0x-prefixed.
          </p>
        )}
      </div>

      {mounted && isUsingFallbackRpc() && (
        <Alert tone="warning" title="Using the public Solana RPC">
          The default endpoint is heavily rate-limited and rejects some of the
          calls these AMM SDKs make. Set{" "}
          <code className="font-mono text-xs">NEXT_PUBLIC_SOLANA_RPC_URL</code>{" "}
          to a dedicated endpoint for reliable results.
        </Alert>
      )}

      {mounted && !connected && (
        <Alert tone="info" title="Connect a Solana wallet">
          You can analyse any mint without connecting, but balances, positions
          and deposits need a wallet.
        </Alert>
      )}

      {tokenQuery.isFetching && !token && <TokenSkeleton />}

      {tokenQuery.isError && (
        <Alert tone="danger" title="Couldn't analyse this mint">
          {parseSolanaError(tokenQuery.error).message}
        </Alert>
      )}

      <AnimatePresence mode="wait">
        {token && !tokenQuery.isFetching && (
          <motion.div
            key={`${platform}-${token.mint}-${quoteMint}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-5"
          >
            <SolanaTokenInfoCard token={token} />

            {samMintAsQuote ? (
              <Alert tone="warning" title="Pick a different pairing">
                This mint is the same asset you selected to pair against.
              </Alert>
            ) : creating && quoteAsset ? (
              <SolanaCreatePoolForm
                platform={platform}
                token={token}
                quoteAsset={quoteAsset}
                onBack={() => setCreating(false)}
                onSuccess={() => {
                  setCreating(false);
                  void poolsQuery.refetch();
                }}
              />
            ) : (
              <>
                {poolsQuery.isError && (
                  <Alert tone="danger" title="Couldn't load pools">
                    {parseSolanaError(poolsQuery.error).message}
                  </Alert>
                )}

                <PoolList
                  pools={pools}
                  loading={poolsQuery.isLoading}
                  selectedId={selectedSummary?.id}
                  onSelect={(pool) => setSelectedPoolId(pool.id)}
                  onCreate={() => setCreating(true)}
                  canCreate={config.supportsCreate}
                  baseSymbol={token.symbol}
                  quoteSymbol={quoteAsset?.symbol ?? "SOL"}
                />

                {detailQuery.isLoading && selectedSummary && (
                  <Skeleton className="h-64 w-full rounded-2xl" />
                )}

                {detailQuery.isError && (
                  <Alert tone="danger" title="Couldn't read pool state">
                    {parseSolanaError(detailQuery.error).message}
                  </Alert>
                )}

                {detailQuery.data && quoteAsset && (
                  <SolanaLiquidityPanel
                    platform={platform}
                    pool={detailQuery.data}
                    token={token}
                    quoteAsset={quoteAsset}
                    onSuccess={() => void detailQuery.refetch()}
                  />
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <SolanaRecentTransactions />
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
