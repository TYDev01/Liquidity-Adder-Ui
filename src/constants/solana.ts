/**
 * Solana platform (DEX) configuration layer — the Solana counterpart to
 * `constants/dex.ts`.
 *
 * Every venue the app can route liquidity through is described declaratively
 * here: its on-chain program, its pool model, and the knobs its deposit flow
 * needs. Adding a venue means adding an entry here plus an adapter in
 * `services/solana/adapters/` — nothing in the UI is venue-specific.
 */

/** Which AMM math a venue uses. This drives the shape of the deposit UI. */
export type PoolModel =
  /** Uniform x*y=k across the whole price curve — deposit is a simple ratio. */
  | "constant-product"
  /** Liquidity concentrated in a tick range — deposit needs a price band. */
  | "concentrated"
  /** Discrete price bins (Meteora DLMM) — price band + distribution strategy. */
  | "bins";

export type SolanaPlatformId =
  | "raydium-cpmm"
  | "raydium-clmm"
  | "orca-whirlpool"
  | "meteora-dlmm"
  | "meteora-damm";

export interface SolanaPlatformConfig {
  id: SolanaPlatformId;
  /** Venue family, used to group entries in the picker. */
  family: "Raydium" | "Orca" | "Meteora";
  /** Full display name. */
  name: string;
  /** One-line explanation shown under the name in the picker. */
  tagline: string;
  poolModel: PoolModel;
  /** Main on-chain program id. */
  programId: string;
  /** Whether this venue's adapter can create a brand-new pool. */
  supportsCreate: boolean;
  /**
   * Fee tiers the venue exposes, in basis points. For concentrated/bin venues
   * a tier is bound to a tick-spacing / bin-step, carried in `tierKey`.
   */
  feeTiers: FeeTier[];
  /** Public REST API used for pool discovery (SDK is used for execution). */
  apiBase?: string;
  docsUrl: string;
}

export interface FeeTier {
  /** Fee in basis points (100 = 1%). */
  feeBps: number;
  /**
   * Venue-specific identifier for this tier: tick spacing (Orca/CLMM), bin
   * step (DLMM), or a config index (Raydium CPMM / Meteora DAMM).
   */
  tierKey: number;
  label: string;
  /** Marks the tier the UI pre-selects. */
  default?: boolean;
}

/* -------------------------------------------------------------------------- */
/*                                  Raydium                                   */
/* -------------------------------------------------------------------------- */

const raydiumCpmm: SolanaPlatformConfig = {
  id: "raydium-cpmm",
  family: "Raydium",
  name: "Raydium CPMM",
  tagline: "Constant-product pools. Simplest deposit, full-range exposure.",
  poolModel: "constant-product",
  programId: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  supportsCreate: true,
  apiBase: "https://api-v3.raydium.io",
  docsUrl: "https://docs.raydium.io",
  feeTiers: [
    { feeBps: 1, tierKey: 0, label: "0.01%" },
    { feeBps: 5, tierKey: 1, label: "0.05%" },
    { feeBps: 25, tierKey: 2, label: "0.25%", default: true },
    { feeBps: 100, tierKey: 3, label: "1%" },
  ],
};

const raydiumClmm: SolanaPlatformConfig = {
  id: "raydium-clmm",
  family: "Raydium",
  name: "Raydium CLMM",
  tagline: "Concentrated liquidity. Higher fee capture inside your range.",
  poolModel: "concentrated",
  programId: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
  supportsCreate: true,
  apiBase: "https://api-v3.raydium.io",
  docsUrl: "https://docs.raydium.io",
  feeTiers: [
    { feeBps: 1, tierKey: 1, label: "0.01%" },
    { feeBps: 5, tierKey: 8, label: "0.05%" },
    { feeBps: 25, tierKey: 60, label: "0.25%", default: true },
    { feeBps: 100, tierKey: 120, label: "1%" },
  ],
};

/* -------------------------------------------------------------------------- */
/*                                    Orca                                    */
/* -------------------------------------------------------------------------- */

const orcaWhirlpool: SolanaPlatformConfig = {
  id: "orca-whirlpool",
  family: "Orca",
  name: "Orca Whirlpools",
  tagline: "Concentrated liquidity with NFT-represented positions.",
  poolModel: "concentrated",
  programId: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
  supportsCreate: true,
  apiBase: "https://api.orca.so",
  docsUrl: "https://dev.orca.so",
  // Orca binds fee rate to tick spacing.
  feeTiers: [
    { feeBps: 1, tierKey: 1, label: "0.01%" },
    { feeBps: 5, tierKey: 8, label: "0.05%" },
    { feeBps: 30, tierKey: 64, label: "0.30%", default: true },
    { feeBps: 100, tierKey: 128, label: "1%" },
    { feeBps: 200, tierKey: 256, label: "2%" },
  ],
};

/** Orca's mainnet WhirlpoolsConfig account — needed to derive pool PDAs. */
export const ORCA_WHIRLPOOLS_CONFIG =
  "2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ";

/* -------------------------------------------------------------------------- */
/*                                  Meteora                                   */
/* -------------------------------------------------------------------------- */

const meteoraDlmm: SolanaPlatformConfig = {
  id: "meteora-dlmm",
  family: "Meteora",
  name: "Meteora DLMM",
  tagline: "Dynamic bins with zero-slippage fills and shapeable liquidity.",
  poolModel: "bins",
  programId: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
  supportsCreate: true,
  apiBase: "https://dlmm-api.meteora.ag",
  docsUrl: "https://docs.meteora.ag",
  // For DLMM the "tier" is the bin step (bps of price movement per bin).
  feeTiers: [
    { feeBps: 1, tierKey: 1, label: "1 bin step" },
    { feeBps: 10, tierKey: 10, label: "10 bin step" },
    { feeBps: 25, tierKey: 25, label: "25 bin step", default: true },
    { feeBps: 100, tierKey: 100, label: "100 bin step" },
  ],
};

const meteoraDamm: SolanaPlatformConfig = {
  id: "meteora-damm",
  family: "Meteora",
  name: "Meteora DAMM v2",
  tagline: "Constant-product pools with dynamic fees. Full-range deposit.",
  poolModel: "constant-product",
  programId: "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
  // Meteora gates DAMM v2 pool creation behind an allowlisted config account
  // that isn't exposed publicly, so this venue is add/remove only.
  supportsCreate: false,
  apiBase: "https://dammv2-api.meteora.ag",
  docsUrl: "https://docs.meteora.ag",
  feeTiers: [
    { feeBps: 25, tierKey: 0, label: "0.25%", default: true },
    { feeBps: 100, tierKey: 1, label: "1%" },
  ],
};

/* -------------------------------------------------------------------------- */
/*                                  Registry                                  */
/* -------------------------------------------------------------------------- */

export const SOLANA_PLATFORMS: Record<SolanaPlatformId, SolanaPlatformConfig> =
  {
    "raydium-cpmm": raydiumCpmm,
    "raydium-clmm": raydiumClmm,
    "orca-whirlpool": orcaWhirlpool,
    "meteora-dlmm": meteoraDlmm,
    "meteora-damm": meteoraDamm,
  };

/**
 * Platforms the picker exposes, in display order. The first entry is the
 * default selection.
 */
export const SOLANA_PLATFORM_IDS: SolanaPlatformId[] = [
  "raydium-cpmm",
  "raydium-clmm",
  "orca-whirlpool",
  "meteora-dlmm",
  "meteora-damm",
];

export const DEFAULT_SOLANA_PLATFORM: SolanaPlatformId =
  (process.env.NEXT_PUBLIC_DEFAULT_SOLANA_PLATFORM as SolanaPlatformId) ??
  "raydium-cpmm";

export function getPlatformConfig(
  id: SolanaPlatformId,
): SolanaPlatformConfig {
  const config = SOLANA_PLATFORMS[id];
  if (!config) {
    throw new Error(
      `Unknown Solana platform "${id}". Add it to SOLANA_PLATFORMS in constants/solana.ts.`,
    );
  }
  return config;
}

export function defaultFeeTier(config: SolanaPlatformConfig): FeeTier {
  const tier = config.feeTiers.find((t) => t.default) ?? config.feeTiers[0];
  if (!tier) {
    throw new Error(`Platform "${config.id}" declares no fee tiers.`);
  }
  return tier;
}

/* -------------------------------------------------------------------------- */
/*                              Chain-level config                            */
/* -------------------------------------------------------------------------- */

/** Well-known mints used as the quote side of a pair. */
export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

export interface QuoteAsset {
  mint: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

/**
 * Assets a token can be paired against. SOL is the default because it is the
 * deepest pairing on every venue here.
 *
 * Declared `as const`-style (non-empty tuple) so the default below is known to
 * exist without a runtime guard.
 */
export const QUOTE_ASSETS: [QuoteAsset, ...QuoteAsset[]] = [
  {
    mint: SOL_MINT,
    symbol: "SOL",
    decimals: 9,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  },
  {
    mint: USDC_MINT,
    symbol: "USDC",
    decimals: 6,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
  },
  {
    mint: USDT_MINT,
    symbol: "USDT",
    decimals: 6,
    logoURI:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png",
  },
];

export const DEFAULT_QUOTE_ASSET = QUOTE_ASSETS[0];

/** Solana cluster metadata (explorer, RPC fallback). */
export const SOLANA_EXPLORER_URL = "https://solscan.io";
export const SOLANA_EXPLORER_NAME = "Solscan";

/** Public fallback RPC. Strongly recommend overriding via env. */
export const SOLANA_FALLBACK_RPC = "https://api.mainnet-beta.solana.com";

/** CoinGecko id for SOL, used for USD pricing of fees/TVL. */
export const SOLANA_COINGECKO_ID = "solana";

/**
 * Rent + protocol fees a pool creation costs, in SOL. Display-only estimate —
 * the wallet shows the real number at signing time.
 */
export const POOL_CREATION_COST_SOL: Record<SolanaPlatformId, number> = {
  "raydium-cpmm": 0.15,
  "raydium-clmm": 0.25,
  "orca-whirlpool": 0.1,
  "meteora-dlmm": 0.08,
  "meteora-damm": 0.1,
};
