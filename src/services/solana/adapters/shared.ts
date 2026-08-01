import { PublicKey } from "@solana/web3.js";

/**
 * Math and helpers shared by every venue adapter.
 *
 * Solana AMMs converge on two conventions, so these live in one place rather
 * than being re-derived per adapter:
 *   - Pools store a canonical mint ordering (byte-wise ascending), which may be
 *     the reverse of what the user typed. Everything user-facing is expressed
 *     as "base / quote"; everything on-chain as "A / B".
 *   - Concentrated venues (Orca Whirlpools, Raydium CLMM) both use the
 *     `1.0001^tick` price grid. Meteora DLMM uses `(1 + binStep/1e4)^binId`.
 */

/* -------------------------------------------------------------------------- */
/*                               Mint ordering                                */
/* -------------------------------------------------------------------------- */

/**
 * Solana pools key on a canonical ordering of the two mints. Returns the pair
 * in on-chain order plus whether that reversed the caller's base/quote sense.
 */
export function orderMints(
  base: string,
  quote: string,
): { mintA: string; mintB: string; flipped: boolean } {
  const a = new PublicKey(base).toBuffer();
  const b = new PublicKey(quote).toBuffer();
  const flipped = Buffer.compare(a, b) > 0;
  return flipped
    ? { mintA: quote, mintB: base, flipped: true }
    : { mintA: base, mintB: quote, flipped: false };
}

/* -------------------------------------------------------------------------- */
/*                                  Slippage                                  */
/* -------------------------------------------------------------------------- */

/** Maximum the user will spend: amount * (1 + slippage). */
export function applySlippageUp(amount: bigint, percent: number): bigint {
  const bps = BigInt(Math.round(percent * 100));
  return (amount * (10_000n + bps)) / 10_000n;
}

/** Minimum the user will accept: amount * (1 - slippage). */
export function applySlippageDown(amount: bigint, percent: number): bigint {
  const bps = BigInt(Math.round(percent * 100));
  if (bps >= 10_000n) return 0n;
  return (amount * (10_000n - bps)) / 10_000n;
}

/* -------------------------------------------------------------------------- */
/*                                Unit helpers                                */
/* -------------------------------------------------------------------------- */

/** Base units → UI number. Display math only — never feed this back on-chain. */
export function toUiAmount(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

/** UI decimal string → base units, truncating excess precision. */
export function toBaseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!trimmed) return 0n;
  const [whole, fraction = ""] = trimmed.split(".");
  const paddedFraction = fraction.slice(0, decimals).padEnd(decimals, "0");
  const digits = `${whole || "0"}${paddedFraction}`.replace(/^0+(?=\d)/, "");
  try {
    return BigInt(digits);
  } catch {
    return 0n;
  }
}

/* -------------------------------------------------------------------------- */
/*                          Concentrated-liquidity ticks                      */
/* -------------------------------------------------------------------------- */

const TICK_BASE = 1.0001;

/** Orca/Raydium CLMM tick bounds. */
export const MIN_TICK = -443636;
export const MAX_TICK = 443636;

/**
 * Convert a tick index to a UI price (quote per base), accounting for the
 * decimal difference between the two mints.
 */
export function tickToUiPrice(
  tick: number,
  decimalsA: number,
  decimalsB: number,
): number {
  return TICK_BASE ** tick * 10 ** (decimalsA - decimalsB);
}

/** Inverse of `tickToUiPrice`, snapped down to the nearest valid tick. */
export function uiPriceToTick(
  price: number,
  decimalsA: number,
  decimalsB: number,
): number {
  if (!(price > 0)) return MIN_TICK;
  const raw = price * 10 ** (decimalsB - decimalsA);
  const tick = Math.log(raw) / Math.log(TICK_BASE);
  return clampTick(Math.floor(tick));
}

/** Ticks must sit on a multiple of the pool's tick spacing. */
export function snapToSpacing(tick: number, spacing: number): number {
  return clampTick(Math.round(tick / spacing) * spacing);
}

export function clampTick(tick: number): number {
  return Math.min(MAX_TICK, Math.max(MIN_TICK, tick));
}

/**
 * Build a tick range from a percentage band around the current price, e.g.
 * ±25%. Returns spacing-aligned ticks with at least one spacing of width.
 */
export function tickRangeFromPercent(
  currentTick: number,
  percentBelow: number,
  percentAbove: number,
  spacing: number,
): { lowerTick: number; upperTick: number } {
  // A price ratio r maps to a tick offset of ln(r)/ln(1.0001).
  const lowerOffset = Math.log(1 - percentBelow / 100) / Math.log(TICK_BASE);
  const upperOffset = Math.log(1 + percentAbove / 100) / Math.log(TICK_BASE);

  let lowerTick = snapToSpacing(currentTick + lowerOffset, spacing);
  let upperTick = snapToSpacing(currentTick + upperOffset, spacing);

  if (upperTick <= lowerTick) {
    lowerTick = snapToSpacing(currentTick - spacing, spacing);
    upperTick = lowerTick + spacing;
  }
  return { lowerTick, upperTick };
}

/** The widest range the venue allows, used for "full range" deposits. */
export function fullRangeTicks(spacing: number): {
  lowerTick: number;
  upperTick: number;
} {
  return {
    lowerTick: Math.ceil(MIN_TICK / spacing) * spacing,
    upperTick: Math.floor(MAX_TICK / spacing) * spacing,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Meteora DLMM bins                             */
/* -------------------------------------------------------------------------- */

/** DLMM bin id → UI price. Bins step by `(1 + binStep/1e4)` each. */
export function binIdToUiPrice(
  binId: number,
  binStep: number,
  decimalsA: number,
  decimalsB: number,
): number {
  return (
    (1 + binStep / 10_000) ** binId * 10 ** (decimalsA - decimalsB)
  );
}

/** Inverse of `binIdToUiPrice`. */
export function uiPriceToBinId(
  price: number,
  binStep: number,
  decimalsA: number,
  decimalsB: number,
): number {
  if (!(price > 0)) return 0;
  const raw = price * 10 ** (decimalsB - decimalsA);
  return Math.floor(Math.log(raw) / Math.log(1 + binStep / 10_000));
}

/* -------------------------------------------------------------------------- */
/*                            Constant-product ratio                          */
/* -------------------------------------------------------------------------- */

/**
 * The counterpart amount required to deposit at the pool's current ratio.
 * Mirrors Uniswap's `quote()`: amountB = amountA * reserveB / reserveA.
 */
export function pairedAmount(
  inputAmount: bigint,
  inputReserve: bigint,
  outputReserve: bigint,
): bigint {
  if (inputReserve === 0n) return 0n;
  return (inputAmount * outputReserve) / inputReserve;
}

/** Pool share a deposit buys, as a fraction 0..1. */
export function poolShareAfterDeposit(
  depositLiquidity: bigint,
  existingSupply: bigint,
): number | undefined {
  const total = existingSupply + depositLiquidity;
  if (total === 0n) return undefined;
  return Number((depositLiquidity * 1_000_000n) / total) / 1_000_000;
}

/* -------------------------------------------------------------------------- */
/*                               Range labelling                              */
/* -------------------------------------------------------------------------- */

/** Human label for a position's price band, used across the position lists. */
export function describeRange(
  lowerPrice: number | undefined,
  upperPrice: number | undefined,
  quoteSymbol: string,
): string {
  if (lowerPrice === undefined || upperPrice === undefined) return "Full range";
  // Treat a band spanning several orders of magnitude as effectively full.
  if (upperPrice / lowerPrice > 1e6) return "Full range";
  return `${formatPrice(lowerPrice)} – ${formatPrice(upperPrice)} ${quoteSymbol}`;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  if (value === 0) return "0";
  if (Math.abs(value) < 0.0001) return value.toExponential(2);
  return value.toLocaleString("en-US", { maximumSignificantDigits: 6 });
}
