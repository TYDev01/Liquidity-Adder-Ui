"use client";

import * as React from "react";
import { AlertTriangle, Copy, ExternalLink, Snowflake } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatRow } from "@/components/ui/stat-row";
import { Alert } from "@/components/ui/alert";
import type { SolanaTokenInfo } from "@/types/solana";
import { formatCompact, formatTokenAmount, shortenAddress } from "@/utils/format";
import { solanaTokenUrl } from "@/utils/solanaExplorer";
import { toUiAmount } from "@/services/solana/adapters/shared";

/**
 * Token summary for a discovered SPL mint.
 *
 * The risk flags shown here are the ones that actually change the outcome of
 * providing liquidity: a live mint authority means the supply can be inflated
 * against your position, a freeze authority means your LP tokens can be
 * immobilised, and a Token-2022 transfer fee silently skims every deposit.
 */
export function SolanaTokenInfoCard({ token }: { token: SolanaTokenInfo }) {
  const [copied, setCopied] = React.useState(false);

  function copy() {
    navigator.clipboard.writeText(token.mint).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const risks: string[] = [];
  if (token.hasMintAuthority) risks.push("mint authority is still active");
  if (token.hasFreezeAuthority) risks.push("freeze authority is still active");
  if (token.transferFeeBps) {
    risks.push(`charges a ${(token.transferFeeBps / 100).toFixed(2)}% transfer fee`);
  }

  return (
    <div className="rounded-2xl border border-border bg-background/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {token.logoURI ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={token.logoURI}
              alt=""
              className="h-12 w-12 rounded-full bg-secondary object-cover"
              onError={(e) => (e.currentTarget.style.visibility = "hidden")}
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-sm font-bold">
              {token.symbol.slice(0, 3)}
            </div>
          )}

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold">{token.name}</h3>
              <Badge tone="info">{token.symbol}</Badge>
              {token.isToken2022 && <Badge tone="default">Token-2022</Badge>}
            </div>
            <button
              onClick={copy}
              className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              {shortenAddress(token.mint, 6)}
              <Copy className="h-3 w-3" />
              {copied && <span className="text-success">copied</span>}
            </button>
          </div>
        </div>

        <a
          href={solanaTokenUrl(token.mint)}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="View on Solscan"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="mt-4 divide-y divide-border/60">
        <StatRow label="Decimals" value={token.decimals} />
        <StatRow
          label="Total supply"
          value={
            token.supply > 0n
              ? formatCompact(toUiAmount(token.supply, token.decimals))
              : "—"
          }
        />
        {token.balance !== undefined && (
          <StatRow
            label="Your balance"
            value={`${formatTokenAmount(token.balance, token.decimals, 4)} ${token.symbol}`}
          />
        )}
        <StatRow
          label="Mint authority"
          value={token.hasMintAuthority ? "Active" : "Revoked"}
          tone={token.hasMintAuthority ? "warning" : "success"}
          hint="An active mint authority can create new supply at any time."
        />
        <StatRow
          label="Freeze authority"
          value={token.hasFreezeAuthority ? "Active" : "Revoked"}
          tone={token.hasFreezeAuthority ? "warning" : "success"}
          hint="An active freeze authority can freeze token accounts, including yours."
        />
      </div>

      {risks.length > 0 && (
        <Alert tone="warning" title="Check this token before depositing" className="mt-4">
          <span className="inline-flex items-start gap-1.5">
            {token.hasFreezeAuthority ? (
              <Snowflake className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <span>
              This mint {risks.join(", ")}. Liquidity you provide is exposed to
              whoever holds those authorities.
            </span>
          </span>
        </Alert>
      )}
    </div>
  );
}
