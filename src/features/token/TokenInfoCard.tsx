"use client";

import * as React from "react";
import { Copy, ExternalLink, ShieldCheck, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatRow } from "@/components/ui/stat-row";
import type { TokenInfo } from "@/types";
import {
  formatCompact,
  formatTokenAmount,
  fromWeiNumber,
  shortenAddress,
} from "@/utils/format";
import { tokenUrl } from "@/utils/explorer";
import { useTokenStore } from "@/features/token/store";
import { cn } from "@/lib/utils";

/** Rich token summary shown after a successful analysis. */
export function TokenInfoCard({ token }: { token: TokenInfo }) {
  const isFavorite = useTokenStore((s) => s.isFavorite);
  const toggleFavorite = useTokenStore((s) => s.toggleFavorite);
  const [copied, setCopied] = React.useState(false);

  const starred = isFavorite(token.address, token.chainId);

  function copy() {
    navigator.clipboard.writeText(token.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-background/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <TokenLogo token={token} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold">{token.name}</h3>
              <Badge tone="info">{token.symbol}</Badge>
            </div>
            <button
              onClick={copy}
              className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              {shortenAddress(token.address, 6)}
              <Copy className="h-3 w-3" />
              {copied && <span className="text-success">copied</span>}
            </button>
          </div>
        </div>

        <button
          onClick={() =>
            toggleFavorite({
              address: token.address,
              chainId: token.chainId,
              symbol: token.symbol,
              name: token.name,
              logoURI: token.logoURI,
              savedAt: Date.now(),
            })
          }
          aria-label={starred ? "Remove favorite" : "Add favorite"}
          className={cn(
            "rounded-lg p-2 transition-colors",
            starred
              ? "text-yellow-400"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Star className={cn("h-5 w-5", starred && "fill-yellow-400")} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <StatRow label="Decimals" value={token.decimals} />
        <StatRow
          label="Total Supply"
          value={formatCompact(fromWeiNumber(token.totalSupply, token.decimals))}
        />
        {token.balance !== undefined && (
          <StatRow
            label="Your Balance"
            value={`${formatTokenAmount(token.balance, token.decimals, 4)} ${token.symbol}`}
          />
        )}
        <StatRow
          label="EIP-2612 Permit"
          value={
            token.supportsPermit ? (
              <span className="inline-flex items-center gap-1 text-success">
                <ShieldCheck className="h-3.5 w-3.5" /> Supported
              </span>
            ) : (
              "approve()"
            )
          }
        />
      </div>

      <a
        href={tokenUrl(token.chainId, token.address)}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        View on explorer <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function TokenLogo({ token }: { token: TokenInfo }) {
  const [failed, setFailed] = React.useState(false);
  if (token.logoURI && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={token.logoURI}
        alt={token.symbol}
        onError={() => setFailed(true)}
        className="h-12 w-12 rounded-full border border-border"
      />
    );
  }
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-base font-bold">
      {token.symbol.slice(0, 3).toUpperCase()}
    </div>
  );
}
