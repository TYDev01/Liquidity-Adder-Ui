"use client";

import { Clock, Star, Trash2 } from "lucide-react";
import { useAccount } from "wagmi";
import { useTokenStore } from "@/features/token/store";
import { useMounted } from "@/hooks/useMounted";
import type { TokenBookmark } from "@/types";
import { cn } from "@/lib/utils";

/** Recent-search + favorite chips that repopulate the address bar on click. */
export function TokenShortcuts({
  onPick,
}: {
  onPick: (address: string) => void;
}) {
  const mounted = useMounted();
  const { chainId } = useAccount();
  const history = useTokenStore((s) => s.history);
  const favorites = useTokenStore((s) => s.favorites);
  const clearHistory = useTokenStore((s) => s.clearHistory);

  if (!mounted) return null;

  // Only show bookmarks for the active chain.
  const chainHistory = history.filter((t) => chainId == null || t.chainId === chainId);
  const chainFavorites = favorites.filter((t) => chainId == null || t.chainId === chainId);

  if (chainHistory.length === 0 && chainFavorites.length === 0) return null;

  return (
    <div className="space-y-3">
      {chainFavorites.length > 0 && (
        <Section icon={<Star className="h-3.5 w-3.5 text-yellow-400" />} title="Favorites">
          {chainFavorites.map((t) => (
            <Chip key={`fav-${t.chainId}-${t.address}`} token={t} onPick={onPick} />
          ))}
        </Section>
      )}

      {chainHistory.length > 0 && (
        <Section
          icon={<Clock className="h-3.5 w-3.5" />}
          title="Recent"
          action={
            <button
              onClick={clearHistory}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" /> Clear
            </button>
          }
        >
          {chainHistory.map((t) => (
            <Chip key={`hist-${t.chainId}-${t.address}`} token={t} onPick={onPick} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {icon} {title}
        </span>
        {action}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  token,
  onPick,
}: {
  token: TokenBookmark;
  onPick: (address: string) => void;
}) {
  return (
    <button
      onClick={() => onPick(token.address)}
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs font-medium",
        "transition-colors hover:border-primary/50 hover:bg-secondary",
      )}
    >
      {token.logoURI ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={token.logoURI}
          alt={token.symbol}
          className="h-4 w-4 rounded-full"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      ) : null}
      {token.symbol}
    </button>
  );
}
