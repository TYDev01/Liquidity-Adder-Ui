"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatTokenAmount } from "@/utils/format";

/**
 * Reusable amount input: symbol pill, live balance, and a "Max" button.
 * Purely presentational — validation and state live in the parent.
 */
export function AmountField({
  label,
  symbol,
  value,
  onChange,
  balance,
  decimals,
  onMax,
  disabled,
  invalid,
  logoURI,
}: {
  label: string;
  symbol: string;
  value: string;
  onChange: (value: string) => void;
  balance?: bigint;
  decimals: number;
  onMax?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  logoURI?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-background/40 p-4 transition-colors",
        invalid ? "border-destructive" : "border-border hover:border-border/80",
      )}
    >
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {balance !== undefined && (
          <button
            type="button"
            onClick={onMax}
            disabled={!onMax || disabled}
            className="tabular-nums transition-colors hover:text-foreground disabled:hover:text-muted-foreground"
          >
            Balance: {formatTokenAmount(balance, decimals, 4)}
            {onMax && <span className="ml-1 font-semibold text-primary">Max</span>}
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <input
          inputMode="decimal"
          placeholder="0.0"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-2xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground/50 disabled:opacity-50"
        />
        <div className="flex shrink-0 items-center gap-2 rounded-full bg-secondary px-3 py-1.5">
          {logoURI ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoURI}
              alt={symbol}
              className="h-5 w-5 rounded-full"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          ) : null}
          <span className="text-sm font-semibold">{symbol}</span>
        </div>
      </div>
    </div>
  );
}
