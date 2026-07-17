/** App-wide, non-chain constants and sensible transaction defaults. */

export const APP_NAME = "Universal Liquidity Manager";
export const APP_DESCRIPTION =
  "Create, add and remove liquidity for any ERC-20 token by pasting its address.";

/** Default slippage tolerance, in percent. */
export const DEFAULT_SLIPPAGE_PERCENT = 0.5;

/** Slippage presets offered in the UI (percent). */
export const SLIPPAGE_PRESETS = [0.1, 0.5, 1] as const;

/** Warn above this slippage, block above MAX. */
export const HIGH_SLIPPAGE_WARNING_PERCENT = 5;
export const MAX_SLIPPAGE_PERCENT = 50;

/** Default transaction deadline, in minutes. */
export const DEFAULT_DEADLINE_MINUTES = 20;

/** Remove-liquidity percentage presets. */
export const REMOVE_PRESETS = [25, 50, 75, 100] as const;

/** localStorage keys (namespaced). */
export const STORAGE_KEYS = {
  searchHistory: "ulm.searchHistory",
  favorites: "ulm.favorites",
  transactions: "ulm.transactions",
} as const;

/** Max entries retained locally. */
export const MAX_SEARCH_HISTORY = 5;
export const MAX_RECENT_TRANSACTIONS = 25;

/** Approx. seconds per block per chain, for "estimated duration" hints. */
export const BLOCK_TIME_SECONDS: Record<number, number> = {
  1: 12,
  8453: 2,
  42161: 1,
  10: 2,
  137: 2,
  56: 3,
};
