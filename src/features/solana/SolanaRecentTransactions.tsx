"use client";

import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { useSolanaTransactionStore } from "./transactionStore";
import { useMounted } from "@/hooks/useMounted";
import { SOLANA_PLATFORMS } from "@/constants/solana";
import { solanaTxUrl } from "@/utils/solanaExplorer";
import { formatRelativeTime, shortenHash } from "@/utils/format";
import type { StoredSolanaTransaction } from "@/types/solana";

const ACTION_LABELS: Record<StoredSolanaTransaction["action"], string> = {
  create: "Created pool",
  add: "Added liquidity",
  remove: "Removed liquidity",
  claim: "Claimed fees",
};

/** Locally persisted Solana activity log. */
export function SolanaRecentTransactions() {
  const mounted = useMounted();
  const transactions = useSolanaTransactionStore((s) => s.transactions);
  const clear = useSolanaTransactionStore((s) => s.clear);

  if (!mounted || transactions.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Recent activity</p>
        <button
          onClick={clear}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Clear
        </button>
      </div>

      <ul className="space-y-2">
        {transactions.map((tx) => (
          <li
            key={tx.signature}
            className="flex items-center justify-between gap-3 rounded-xl bg-secondary/30 px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <StatusIcon status={tx.status} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {ACTION_LABELS[tx.action]} · {tx.tokenSymbol}
                </p>
                <p className="text-xs text-muted-foreground">
                  {SOLANA_PLATFORMS[tx.platform]?.name ?? tx.platform} ·{" "}
                  {formatRelativeTime(tx.createdAt)}
                </p>
              </div>
            </div>

            <a
              href={solanaTxUrl(tx.signature)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-primary hover:underline"
            >
              {shortenHash(tx.signature)}
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusIcon({ status }: { status: StoredSolanaTransaction["status"] }) {
  if (status === "pending") {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />;
  }
  if (status === "confirmed") {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />;
  }
  return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
}
