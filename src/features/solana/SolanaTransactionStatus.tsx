"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import type { TxStage } from "@/types";
import type { FriendlyError } from "@/utils/errors";
import { solanaTxUrl } from "@/utils/solanaExplorer";
import { SOLANA_EXPLORER_NAME } from "@/constants/solana";
import { cn } from "@/lib/utils";

/**
 * Solana transaction lifecycle display. Mirrors the EVM `TransactionStatus`
 * but adds a step counter, since a single Solana action (create pool → open
 * position → deposit) can span several transactions in one wallet approval.
 */

const STAGE_LABELS: Record<Exclude<TxStage, "idle">, string> = {
  preparing: "Simulating transaction…",
  awaiting_signature: "Approve in your wallet…",
  broadcasting: "Sending to the cluster…",
  pending: "Waiting for confirmation…",
  confirmed: "Confirmed",
  failed: "Transaction failed",
};

export function SolanaTransactionStatus({
  stage,
  signatures,
  error,
  step,
  totalSteps,
  stepLabel,
  onDismiss,
}: {
  stage: TxStage;
  signatures: string[];
  error?: FriendlyError;
  step: number;
  totalSteps: number;
  stepLabel?: string;
  onDismiss?: () => void;
}) {
  const visible = stage !== "idle";
  const isError = stage === "failed";
  const isDone = stage === "confirmed";
  const isBusy = !isError && !isDone;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div
            className={cn(
              "mt-4 flex items-start gap-3 rounded-2xl border p-4",
              isError && "border-destructive/40 bg-destructive/10",
              isDone && "border-success/40 bg-success/10",
              isBusy && "border-primary/40 bg-primary/10",
            )}
          >
            <div className="mt-0.5">
              {isBusy && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
              {isDone && <CheckCircle2 className="h-5 w-5 text-success" />}
              {isError && <XCircle className="h-5 w-5 text-destructive" />}
            </div>

            <div className="flex-1">
              <p className="text-sm font-semibold">
                {isError && error
                  ? error.title
                  : STAGE_LABELS[stage as Exclude<TxStage, "idle">]}
              </p>

              {isError && error && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {error.message}
                </p>
              )}

              {!isError && totalSteps > 1 && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Step {Math.min(step, totalSteps)} of {totalSteps}
                  {stepLabel ? ` — ${stepLabel}` : ""}
                </p>
              )}

              {signatures.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {signatures.map((signature, index) => (
                    <a
                      key={signature}
                      href={solanaTxUrl(signature)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {signatures.length > 1 ? `Tx ${index + 1}` : "View"} on{" "}
                      {SOLANA_EXPLORER_NAME}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              )}
            </div>

            {(isError || isDone) && onDismiss && (
              <button
                onClick={onDismiss}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
