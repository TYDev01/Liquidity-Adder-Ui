import { getAddress, isAddress, type Address } from "viem";

/**
 * Address validation helpers. We never trust raw user input — an address is
 * normalised to its checksummed form and rejected if malformed.
 */

export function isValidAddress(value: string): boolean {
  return isAddress(value.trim());
}

/** Returns the checksummed address, or null when invalid. */
export function normalizeAddress(value: string): Address | null {
  const trimmed = value.trim();
  if (!isAddress(trimmed)) return null;
  return getAddress(trimmed);
}

export const ZERO_ADDRESS: Address =
  "0x0000000000000000000000000000000000000000";

export function isZeroAddress(value: string | undefined | null): boolean {
  return !!value && value.toLowerCase() === ZERO_ADDRESS.toLowerCase();
}

export function addressesEqual(
  a: string | undefined | null,
  b: string | undefined | null,
): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/**
 * Validate a human-entered decimal amount string against a token's decimals.
 * Returns an error message, or null when valid.
 */
export function validateAmountInput(
  value: string,
  decimals: number,
): string | null {
  if (value.trim() === "") return null; // empty is "unset", not invalid
  if (!/^\d*\.?\d*$/.test(value)) return "Enter a valid number";
  const [, fraction = ""] = value.split(".");
  if (fraction.length > decimals) {
    return `Max ${decimals} decimal places for this token`;
  }
  if (Number(value) <= 0) return "Amount must be greater than zero";
  return null;
}

export function clampSlippage(percent: number, max: number): number {
  if (Number.isNaN(percent) || percent < 0) return 0;
  return Math.min(percent, max);
}
