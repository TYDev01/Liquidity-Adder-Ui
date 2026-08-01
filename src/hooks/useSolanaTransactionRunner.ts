"use client";

import { useCallback, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import type { TxStage } from "@/types";
import type {
  BuiltTransactions,
  SolanaLiquidityAction,
} from "@/types/solana";
import type { SolanaPlatformId } from "@/constants/solana";
import { parseSolanaError } from "@/utils/solanaErrors";
import type { FriendlyError } from "@/utils/errors";
import { useSolanaTransactionStore } from "@/features/solana/transactionStore";

/**
 * Centralised Solana transaction lifecycle — the counterpart to
 * `useTransactionRunner`, with the same stages so the shared status UI works
 * for both ecosystems.
 *
 * Differences that matter versus EVM:
 *   - A venue action can require several transactions (e.g. create pool, then
 *     open a position). They are signed in one wallet prompt and sent in order.
 *   - Simulation is a separate RPC call rather than part of sending, so it is
 *     done explicitly before asking for a signature.
 *   - Blockhashes expire in ~60s, so they are stamped immediately before
 *     signing, not when the SDK built the transaction.
 */

export interface RunSolanaTxParams {
  built: BuiltTransactions;
  action: SolanaLiquidityAction;
  platform: SolanaPlatformId;
  tokenSymbol: string;
  mint: string;
}

export interface SolanaRunnerState {
  stage: TxStage;
  /** Signature of the most recently sent transaction. */
  signature?: string;
  /** All signatures produced by a multi-step action. */
  signatures: string[];
  error?: FriendlyError;
  /** Which step of a multi-transaction action is in flight, 1-based. */
  step: number;
  totalSteps: number;
  /** Label of the step currently in flight. */
  stepLabel?: string;
  isBusy: boolean;
  run: (params: RunSolanaTxParams) => Promise<string[] | undefined>;
  reset: () => void;
}

function isVersioned(
  tx: Transaction | VersionedTransaction,
): tx is VersionedTransaction {
  return "version" in tx;
}

export function useSolanaTransactionRunner(): SolanaRunnerState {
  const { connection } = useConnection();
  const { publicKey, signAllTransactions } = useWallet();
  const addTransaction = useSolanaTransactionStore((s) => s.addTransaction);
  const updateStatus = useSolanaTransactionStore((s) => s.updateStatus);

  const [stage, setStage] = useState<TxStage>("idle");
  const [signatures, setSignatures] = useState<string[]>([]);
  const [error, setError] = useState<FriendlyError | undefined>();
  const [step, setStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [stepLabel, setStepLabel] = useState<string | undefined>();

  const inFlight = useRef(false);

  const reset = useCallback(() => {
    setStage("idle");
    setSignatures([]);
    setError(undefined);
    setStep(0);
    setTotalSteps(0);
    setStepLabel(undefined);
  }, []);

  const run = useCallback(
    async (params: RunSolanaTxParams): Promise<string[] | undefined> => {
      if (inFlight.current) return undefined;

      if (!publicKey || !signAllTransactions) {
        setError({
          title: "Wallet not ready",
          message: "Connect a Solana wallet and try again.",
          isUserRejection: false,
        });
        setStage("failed");
        return undefined;
      }

      const { transactions, labels, extraSigners } = params.built;
      if (transactions.length === 0) {
        setError({
          title: "Nothing to send",
          message: "The venue returned no transaction for this action.",
          isUserRejection: false,
        });
        setStage("failed");
        return undefined;
      }

      inFlight.current = true;
      setError(undefined);
      setSignatures([]);
      setTotalSteps(transactions.length);
      setStep(1);
      setStepLabel(labels[0]);

      const sent: string[] = [];

      try {
        // 1. Stamp fresh blockhashes, then simulate every leg up front so a
        //    doomed action fails before the user is asked to sign anything.
        setStage("preparing");
        const latest = await connection.getLatestBlockhash("confirmed");
        transactions.forEach((tx, index) => {
          if (isVersioned(tx)) {
            tx.message.recentBlockhash = latest.blockhash;
          } else {
            tx.recentBlockhash = latest.blockhash;
            tx.feePayer = publicKey;
          }

          // Apply keypairs the venue generated (position NFTs, pool state
          // accounts). Order matters: the blockhash above is now final, and
          // the wallet's signature is added on top of these.
          const signers = extraSigners?.[index];
          if (signers?.length) {
            if (isVersioned(tx)) {
              tx.sign(signers);
            } else {
              tx.partialSign(...signers);
            }
          }
        });

        // Only the first leg is simulatable in isolation — later legs depend on
        // accounts the earlier ones create.
        const first = transactions[0]!;
        const simulation = isVersioned(first)
          ? await connection.simulateTransaction(first, {
              sigVerify: false,
              replaceRecentBlockhash: true,
            })
          : await connection.simulateTransaction(first);

        if (simulation.value.err) {
          throw Object.assign(
            new Error("Transaction simulation failed"),
            { logs: simulation.value.logs ?? [] },
          );
        }

        // 2. One wallet prompt for the whole action.
        setStage("awaiting_signature");
        const signed = await signAllTransactions(transactions);

        // 3. Send and confirm each leg in order.
        for (const [i, tx] of signed.entries()) {
          setStep(i + 1);
          setStepLabel(labels[i]);
          setStage("broadcasting");

          const raw = tx.serialize();
          const signature = await connection.sendRawTransaction(raw, {
            skipPreflight: false,
            maxRetries: 3,
          });

          sent.push(signature);
          setSignatures([...sent]);

          addTransaction({
            signature,
            platform: params.platform,
            action: params.action,
            tokenSymbol: params.tokenSymbol,
            mint: params.mint,
            status: "pending",
            createdAt: Date.now(),
          });

          setStage("pending");
          const result = await connection.confirmTransaction(
            {
              signature,
              blockhash: latest.blockhash,
              lastValidBlockHeight: latest.lastValidBlockHeight,
            },
            "confirmed",
          );

          if (result.value.err) {
            updateStatus(signature, "failed");
            throw Object.assign(
              new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`),
              { logs: [] },
            );
          }
          updateStatus(signature, "confirmed");
        }

        setStage("confirmed");
        return sent;
      } catch (err) {
        const friendly = parseSolanaError(err);
        setError(friendly);
        setStage(friendly.isUserRejection ? "idle" : "failed");
        return undefined;
      } finally {
        inFlight.current = false;
      }
    },
    [connection, publicKey, signAllTransactions, addTransaction, updateStatus],
  );

  return {
    stage,
    signature: signatures[signatures.length - 1],
    signatures,
    error,
    step,
    totalSteps,
    stepLabel,
    isBusy:
      stage === "preparing" ||
      stage === "awaiting_signature" ||
      stage === "broadcasting" ||
      stage === "pending",
    run,
    reset,
  };
}
