"use client";

import { useCallback, useRef, useState } from "react";
import type { Abi, Address, Hash } from "viem";
import {
  usePublicClient,
  useWalletClient,
  useAccount,
} from "wagmi";
import type { LiquidityAction, TxStage } from "@/types";
import { parseError, type FriendlyError } from "@/utils/errors";
import { useTransactionStore } from "@/features/liquidity/transactionStore";

/**
 * Centralised transaction lifecycle: simulate → sign → broadcast → wait.
 *
 * Every write in the app goes through this hook so the UX stages, duplicate
 * submission guard, error normalisation and local transaction log are handled
 * in exactly one place (DRY + SOLID single-responsibility).
 */

export interface RunTxParams {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  /** Native value to send (payable calls). */
  value?: bigint;
  /** For the activity log. */
  action: LiquidityAction;
  tokenSymbol: string;
  tokenAddress: Address;
}

export interface TransactionRunnerState {
  stage: TxStage;
  hash?: Hash;
  error?: FriendlyError;
  isBusy: boolean;
  run: (params: RunTxParams) => Promise<Hash | undefined>;
  reset: () => void;
}

export function useTransactionRunner(): TransactionRunnerState {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { address: account, chainId } = useAccount();
  const addTransaction = useTransactionStore((s) => s.addTransaction);
  const updateStatus = useTransactionStore((s) => s.updateStatus);

  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState<Hash | undefined>();
  const [error, setError] = useState<FriendlyError | undefined>();

  // Guard against duplicate submissions / double clicks.
  const inFlight = useRef(false);

  const reset = useCallback(() => {
    setStage("idle");
    setHash(undefined);
    setError(undefined);
  }, []);

  const run = useCallback(
    async (params: RunTxParams): Promise<Hash | undefined> => {
      if (inFlight.current) return undefined;
      if (!publicClient || !walletClient || !account || chainId == null) {
        setError({
          title: "Wallet not ready",
          message: "Connect your wallet and try again.",
          isUserRejection: false,
        });
        setStage("failed");
        return undefined;
      }

      inFlight.current = true;
      setError(undefined);
      setHash(undefined);

      try {
        // 1. Simulate — surfaces reverts before the user pays gas.
        setStage("preparing");
        const { request } = await publicClient.simulateContract({
          account,
          address: params.address,
          abi: params.abi,
          functionName: params.functionName,
          args: params.args,
          value: params.value,
        });

        // 2. Ask the wallet to sign.
        setStage("awaiting_signature");
        const txHash = await walletClient.writeContract(request);
        setHash(txHash);

        // 3. Broadcasting → record as pending locally.
        setStage("broadcasting");
        addTransaction({
          hash: txHash,
          chainId,
          action: params.action,
          tokenSymbol: params.tokenSymbol,
          tokenAddress: params.tokenAddress,
          status: "pending",
          createdAt: Date.now(),
        });

        // 4. Wait for inclusion.
        setStage("pending");
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
        });

        if (receipt.status === "success") {
          setStage("confirmed");
          updateStatus(txHash, "confirmed");
          return txHash;
        }
        setStage("failed");
        updateStatus(txHash, "failed");
        setError({
          title: "Transaction reverted",
          message: "The transaction was mined but reverted on-chain.",
          isUserRejection: false,
        });
        return undefined;
      } catch (err) {
        const friendly = parseError(err);
        setError(friendly);
        setStage(friendly.isUserRejection ? "idle" : "failed");
        return undefined;
      } finally {
        inFlight.current = false;
      }
    },
    [publicClient, walletClient, account, chainId, addTransaction, updateStatus],
  );

  return {
    stage,
    hash,
    error,
    isBusy:
      stage === "preparing" ||
      stage === "awaiting_signature" ||
      stage === "broadcasting" ||
      stage === "pending",
    run,
    reset,
  };
}
