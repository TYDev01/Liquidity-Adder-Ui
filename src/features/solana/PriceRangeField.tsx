"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { formatNumber } from "@/utils/format";
import { cn } from "@/lib/utils";

/**
 * Price-band selector for concentrated (Orca / Raydium CLMM) and bin (Meteora
 * DLMM) venues.
 *
 * Full-range is offered but not the default: it behaves like a constant-product
 * pool and earns proportionally less fee. A band is expressed to the user in
 * quote-per-base price terms and converted to ticks/bins by the adapter, which
 * owns the venue's snapping rules.
 */

export interface PriceRange {
  lowerPrice: number;
  upperPrice: number;
  /** True when the user asked for the widest band the venue allows. */
  isFullRange: boolean;
}

const PRESETS = [
  { label: "±5%", percent: 5 },
  { label: "±15%", percent: 15 },
  { label: "±50%", percent: 50 },
] as const;

export function PriceRangeField({
  currentPrice,
  value,
  onChange,
  baseSymbol,
  quoteSymbol,
  disabled,
}: {
  currentPrice: number;
  value: PriceRange;
  onChange: (range: PriceRange) => void;
  baseSymbol: string;
  quoteSymbol: string;
  disabled?: boolean;
}) {
  const [lowerText, setLowerText] = React.useState("");
  const [upperText, setUpperText] = React.useState("");

  // Keep the text inputs in sync when a preset rewrites the range.
  React.useEffect(() => {
    setLowerText(value.isFullRange ? "" : formatInput(value.lowerPrice));
    setUpperText(value.isFullRange ? "" : formatInput(value.upperPrice));
  }, [value.lowerPrice, value.upperPrice, value.isFullRange]);

  function applyPercent(percent: number) {
    onChange({
      lowerPrice: currentPrice * (1 - percent / 100),
      upperPrice: currentPrice * (1 + percent / 100),
      isFullRange: false,
    });
  }

  function applyFullRange() {
    onChange({ lowerPrice: 0, upperPrice: Infinity, isFullRange: true });
  }

  function commitBound(side: "lower" | "upper", text: string) {
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onChange({
      lowerPrice: side === "lower" ? parsed : value.lowerPrice,
      upperPrice: side === "upper" ? parsed : value.upperPrice,
      isFullRange: false,
    });
  }

  /** Nudge a bound by 1%, matching how these controls behave on the venues. */
  function step(side: "lower" | "upper", direction: 1 | -1) {
    const current = side === "lower" ? value.lowerPrice : value.upperPrice;
    if (!Number.isFinite(current) || current <= 0) return;
    const next = current * (1 + 0.01 * direction);
    onChange({
      lowerPrice: side === "lower" ? next : value.lowerPrice,
      upperPrice: side === "upper" ? next : value.upperPrice,
      isFullRange: false,
    });
  }

  const invalid =
    !value.isFullRange &&
    (!(value.lowerPrice > 0) ||
      !(value.upperPrice > value.lowerPrice));

  const outOfRange =
    !value.isFullRange &&
    !invalid &&
    (currentPrice < value.lowerPrice || currentPrice > value.upperPrice);

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-background/40 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Price range
        </span>
        <span className="text-xs text-muted-foreground">
          Current{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {formatNumber(currentPrice, 6)}
          </span>{" "}
          {quoteSymbol}/{baseSymbol}
        </span>
      </div>

      <div className="flex gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            disabled={disabled || !(currentPrice > 0)}
            onClick={() => applyPercent(preset.percent)}
            className={cn(
              "flex-1 rounded-lg border border-border bg-background/60 px-2 py-1.5 text-xs font-semibold transition-colors",
              "hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={applyFullRange}
          className={cn(
            "flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors",
            value.isFullRange
              ? "border-primary/60 bg-primary/10"
              : "border-border bg-background/60 hover:border-primary/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          Full
        </button>
      </div>

      {!value.isFullRange && (
        <div className="grid grid-cols-2 gap-2">
          <BoundInput
            label="Min price"
            value={lowerText}
            onChange={setLowerText}
            onCommit={(text) => commitBound("lower", text)}
            onStep={(d) => step("lower", d)}
            suffix={`${quoteSymbol}/${baseSymbol}`}
            disabled={disabled}
          />
          <BoundInput
            label="Max price"
            value={upperText}
            onChange={setUpperText}
            onCommit={(text) => commitBound("upper", text)}
            onStep={(d) => step("upper", d)}
            suffix={`${quoteSymbol}/${baseSymbol}`}
            disabled={disabled}
          />
        </div>
      )}

      {value.isFullRange && (
        <p className="text-xs text-muted-foreground">
          Full range behaves like a constant-product pool: your liquidity is
          spread across every price, so it earns a smaller share of fees but
          never goes inactive.
        </p>
      )}

      {invalid && (
        <Alert tone="danger" title="Invalid range">
          The maximum price must be above the minimum.
        </Alert>
      )}

      {outOfRange && (
        <Alert tone="warning" title="Range excludes the current price">
          The pool price sits outside this band, so you&apos;ll deposit a single
          token and earn no fees until the price moves into range.
        </Alert>
      )}
    </div>
  );
}

function BoundInput({
  label,
  value,
  onChange,
  onCommit,
  onStep,
  suffix,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onStep: (direction: 1 | -1) => void;
  suffix: string;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[0.7rem] text-muted-foreground">{label}</span>
        <div className="flex gap-0.5">
          <button
            type="button"
            aria-label={`Decrease ${label}`}
            disabled={disabled}
            onClick={() => onStep(-1)}
            className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label={`Increase ${label}`}
            disabled={disabled}
            onClick={() => onStep(1)}
            className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
      <input
        inputMode="decimal"
        placeholder="0.0"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        className="w-full bg-transparent text-base font-semibold tabular-nums outline-none placeholder:text-muted-foreground/50 disabled:opacity-50"
      />
      <span className="text-[0.65rem] text-muted-foreground">{suffix}</span>
    </div>
  );
}

function formatInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 0.000001) return value.toExponential(4);
  return String(Number(value.toPrecision(8)));
}
