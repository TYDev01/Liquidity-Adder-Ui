"use client";

import { useCallback, useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdapter } from "@/services/solana/adapters";
import type { SolanaPlatformId } from "@/constants/solana";
import type {
  AdapterContext,
  CreatePoolParams,
  SolanaAddQuote,
  SolanaPoolDetail,
  SolanaPosition,
  SolanaRemoveQuote,
  SolanaTokenInfo,
} from "@/types/solana";
import { useSolanaTransactionRunner } from "./useSolanaTransactionRunner";

/**
 * Quoting and execution for Solana liquidity actions.
 *
 * Quotes are React Query reads (debounced by the caller through the amount it
 * passes); writes go through the shared Solana transaction runner so every
 * venue gets identical staging, error mapping and activity logging.
 */

/* -------------------------------------------------------------------------- */
/*                                  Quoting                                   */
/* -------------------------------------------------------------------------- */

export function useSolanaAddQuote({
  pool,
  inputSide,
  inputAmount,
  slippagePercent,
  lowerPrice,
  upperPrice,
  positionId,
  enabled = true,
}: {
  pool: SolanaPoolDetail | undefined;
  inputSide: "A" | "B";
  inputAmount: bigint;
  slippagePercent: number;
  lowerPrice?: number;
  upperPrice?: number;
  positionId?: string;
  enabled?: boolean;
}) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  return useQuery<SolanaAddQuote>({
    queryKey: [
      "solana-add-quote",
      pool?.platform,
      pool?.id,
      inputSide,
      inputAmount.toString(),
      slippagePercent,
      lowerPrice,
      upperPrice,
      positionId,
    ],
    enabled: enabled && Boolean(pool) && inputAmount > 0n,
    queryFn: () =>
      getAdapter(pool!.platform).quoteAdd(
        { connection, owner: publicKey ?? undefined },
        {
          pool: pool!,
          inputSide,
          inputAmount,
          slippagePercent,
          lowerPrice,
          upperPrice,
          positionId,
        },
      ),
    retry: 0,
    staleTime: 5_000,
  });
}

export function useSolanaRemoveQuote({
  pool,
  position,
  fraction,
  slippagePercent,
}: {
  pool: SolanaPoolDetail | undefined;
  position: SolanaPosition | undefined;
  fraction: number;
  slippagePercent: number;
}) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  return useQuery<SolanaRemoveQuote>({
    queryKey: [
      "solana-remove-quote",
      pool?.platform,
      pool?.id,
      position?.id,
      fraction,
      slippagePercent,
    ],
    enabled: Boolean(pool) && Boolean(position) && fraction > 0,
    queryFn: () =>
      getAdapter(pool!.platform).quoteRemove(
        { connection, owner: publicKey ?? undefined },
        { pool: pool!, position: position!, fraction, slippagePercent },
      ),
    retry: 0,
    staleTime: 5_000,
  });
}

/* -------------------------------------------------------------------------- */
/*                                 Execution                                  */
/* -------------------------------------------------------------------------- */

export function useSolanaLiquidityActions(platform: SolanaPlatformId) {
  const runner = useSolanaTransactionRunner();
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const queryClient = useQueryClient();

  /** Assemble the adapter context, or undefined when the wallet can't sign. */
  const context = useMemo<AdapterContext | undefined>(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return undefined;
    return {
      connection,
      wallet: { publicKey, signTransaction, signAllTransactions },
    };
  }, [connection, publicKey, signTransaction, signAllTransactions]);

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["solana-pool-detail"] }),
      queryClient.invalidateQueries({ queryKey: ["solana-pools"] }),
      queryClient.invalidateQueries({ queryKey: ["solana-token-info"] }),
      queryClient.invalidateQueries({ queryKey: ["solana-quote-asset"] }),
    ]);
  }, [queryClient]);

  const addLiquidity = useCallback(
    async ({
      pool,
      quote,
      slippagePercent,
      positionId,
      tokenSymbol,
      mint,
    }: {
      pool: SolanaPoolDetail;
      quote: SolanaAddQuote;
      slippagePercent: number;
      positionId?: string;
      tokenSymbol: string;
      mint: string;
    }) => {
      if (!context) return undefined;

      const built = await getAdapter(platform).buildAdd(context, {
        pool,
        quote,
        slippagePercent,
        positionId,
      });

      const signatures = await runner.run({
        built,
        action: "add",
        platform,
        tokenSymbol,
        mint,
      });

      if (signatures) await invalidate();
      return signatures;
    },
    [context, platform, runner, invalidate],
  );

  const removeLiquidity = useCallback(
    async ({
      pool,
      position,
      fraction,
      slippagePercent,
      tokenSymbol,
      mint,
    }: {
      pool: SolanaPoolDetail;
      position: SolanaPosition;
      fraction: number;
      slippagePercent: number;
      tokenSymbol: string;
      mint: string;
    }) => {
      if (!context) return undefined;

      const built = await getAdapter(platform).buildRemove(context, {
        pool,
        position,
        fraction,
        slippagePercent,
      });

      const signatures = await runner.run({
        built,
        action: "remove",
        platform,
        tokenSymbol,
        mint,
      });

      if (signatures) await invalidate();
      return signatures;
    },
    [context, platform, runner, invalidate],
  );

  const createPool = useCallback(
    async (
      params: CreatePoolParams & { token: SolanaTokenInfo },
    ) => {
      if (!context) return undefined;

      const { token, ...createParams } = params;
      const built = await getAdapter(platform).buildCreatePool(
        context,
        createParams,
      );

      const signatures = await runner.run({
        built,
        action: "create",
        platform,
        tokenSymbol: token.symbol,
        mint: token.mint,
      });

      if (signatures) await invalidate();
      return signatures;
    },
    [context, platform, runner, invalidate],
  );

  return {
    ...runner,
    ready: Boolean(context),
    addLiquidity,
    removeLiquidity,
    createPool,
  };
}
