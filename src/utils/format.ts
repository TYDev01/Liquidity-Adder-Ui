import { formatUnits, parseUnits } from "viem";

/**
 * Formatting helpers for on-chain values. All display-facing conversions live
 * here so rounding rules are consistent across the app.
 */

/** Parse a decimal string to wei; throws on malformed input (validate first). */
export function toWei(value: string, decimals: number): bigint {
  if (!value || value.trim() === "") return 0n;
  return parseUnits(value as `${number}`, decimals);
}

/** Convert wei to a JS number of token units (safe for display math only). */
export function fromWeiNumber(value: bigint, decimals: number): number {
  return Number(formatUnits(value, decimals));
}

/** Format a bigint amount for display with a sensible number of significant digits. */
export function formatTokenAmount(
  value: bigint | undefined,
  decimals: number,
  maxFractionDigits = 6,
): string {
  if (value === undefined) return "—";
  const asNumber = Number(formatUnits(value, decimals));
  return formatNumber(asNumber, maxFractionDigits);
}

/** Format a plain number with grouping and adaptive precision. */
export function formatNumber(value: number, maxFractionDigits = 6): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  // Very small values: show more precision.
  if (abs > 0 && abs < 0.0001) {
    return value.toExponential(2);
  }
  const digits = abs >= 1000 ? 2 : maxFractionDigits;
  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function formatUsd(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 4 : 2,
  });
}

export function formatPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

/** 0x1234…abcd style truncation for addresses / hashes. */
export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function shortenHash(hash: string): string {
  return shortenAddress(hash, 6);
}

/** Compact large numbers (e.g. total supply, TVL): 1.2M, 3.4B. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `~${Math.max(1, Math.round(seconds))}s`;
  const min = Math.round(seconds / 60);
  return `~${min}m`;
}
