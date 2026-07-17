"use client";

import { ArrowUpRight, CheckCircle2, Clock, Trash2, XCircle } from "lucide-react";
import { useAccount } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTransactionStore } from "@/features/liquidity/transactionStore";
import { useMounted } from "@/hooks/useMounted";
import type { LiquidityAction, StoredTransaction } from "@/types";
import { txUrl } from "@/utils/explorer";
import { formatRelativeTime, shortenHash } from "@/utils/format";
import { cn } from "@/lib/utils";

const ACTION_LABELS: Record<LiquidityAction, string> = {
  approve: "Approve",
  create: "Create pool",
  add: "Add liquidity",
  remove: "Remove liquidity",
};

/** Locally persisted activity log for the connected session. */
export function RecentTransactions() {
  const mounted = useMounted();
  const { chainId } = useAccount();
  const transactions = useTransactionStore((s) => s.transactions);
  const clear = useTransactionStore((s) => s.clear);

  if (!mounted || transactions.length === 0) return null;

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Recent activity</CardTitle>
        <button
          onClick={clear}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" /> Clear
        </button>
      </CardHeader>
      <CardContent className="space-y-1">
        {transactions.map((tx) => (
          <Row key={tx.hash} tx={tx} explorerChainId={tx.chainId ?? chainId ?? 1} />
        ))}
      </CardContent>
    </Card>
  );
}

function Row({
  tx,
  explorerChainId,
}: {
  tx: StoredTransaction;
  explorerChainId: number;
}) {
  return (
    <a
      href={txUrl(explorerChainId, tx.hash)}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between rounded-xl px-2 py-2 transition-colors hover:bg-secondary/50"
    >
      <div className="flex items-center gap-3">
        <StatusIcon status={tx.status} />
        <div>
          <p className="text-sm font-medium">
            {ACTION_LABELS[tx.action]}{" "}
            <span className="text-muted-foreground">{tx.tokenSymbol}</span>
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {shortenHash(tx.hash)} · {formatRelativeTime(tx.createdAt)}
          </p>
        </div>
      </div>
      <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
    </a>
  );
}

function StatusIcon({ status }: { status: StoredTransaction["status"] }) {
  const map = {
    pending: { Icon: Clock, className: "text-yellow-400" },
    confirmed: { Icon: CheckCircle2, className: "text-success" },
    failed: { Icon: XCircle, className: "text-destructive" },
  } as const;
  const { Icon, className } = map[status];
  return <Icon className={cn("h-5 w-5", className)} />;
}
