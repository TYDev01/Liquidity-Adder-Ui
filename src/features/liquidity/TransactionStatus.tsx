"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import type { Hash } from "viem";
import { useAccount } from "wagmi";
import type { TxStage } from "@/types";
import type { FriendlyError } from "@/utils/errors";
import { txUrl } from "@/utils/explorer";
import { getChainConfig } from "@/constants/dex";
import { cn } from "@/lib/utils";

/**
 * Renders the live transaction lifecycle: preparing → wallet → broadcasting →
 * pending → confirmed/failed, with an explorer link once a hash exists.
 */

const STAGE_LABELS: Record<Exclude<TxStage, "idle">, string> = {
  preparing: "Simulating transaction…",
  awaiting_signature: "Confirm in your wallet…",
  broadcasting: "Broadcasting to the network…",
  pending: "Waiting for confirmation…",
  confirmed: "Transaction confirmed",
  failed: "Transaction failed",
};

export function TransactionStatus({
  stage,
  hash,
  error,
  onDismiss,
}: {
  stage: TxStage;
  hash?: Hash;
  error?: FriendlyError;
  onDismiss?: () => void;
}) {
  const { chainId } = useAccount();
  const visible = stage !== "idle";
  const isError = stage === "failed";
  const isDone = stage === "confirmed";
  const isBusy = !isError && !isDone;

  const explorerName =
    chainId != null ? getChainConfig(chainId).explorerName : "explorer";

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
                {isError && error ? error.title : STAGE_LABELS[stage as Exclude<TxStage, "idle">]}
              </p>
              {isError && error && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {error.message}
                </p>
              )}
              {hash && chainId != null && (
                <a
                  href={txUrl(chainId, hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  View on {explorerName} <ExternalLink className="h-3 w-3" />
                </a>
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
