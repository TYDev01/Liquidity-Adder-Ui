"use client";

import * as React from "react";
import { QUOTE_ASSETS } from "@/constants/solana";
import { cn } from "@/lib/utils";

/**
 * Which asset the pasted token gets paired against. Solana venues have no
 * canonical "wrapped native" side the way a V2 router does — SOL, USDC and
 * USDT pools all coexist for the same mint — so the pairing is an explicit
 * choice rather than an assumption.
 */
export function QuoteAssetPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (mint: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        Pair against
      </label>
      <div className="flex gap-2">
        {QUOTE_ASSETS.map((asset) => {
          const selected = asset.mint === value;
          return (
            <button
              key={asset.mint}
              type="button"
              disabled={disabled}
              onClick={() => onChange(asset.mint)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border bg-background/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {asset.logoURI && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={asset.logoURI}
                  alt=""
                  className="h-4 w-4 rounded-full"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              )}
              {asset.symbol}
            </button>
          );
        })}
      </div>
    </div>
  );
}
