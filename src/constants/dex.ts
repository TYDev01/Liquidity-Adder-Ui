import type { Address } from "viem";

/**
 * DEX + chain configuration layer.
 *
 * Every chain the app supports is described here declaratively. Adding a new
 * V2-fork DEX or a new EVM chain should require *only* adding an entry to this
 * map — no changes to services, hooks or UI. This is the single source of truth
 * for factory/router/WETH addresses and chain metadata.
 */

export interface DexConfig {
  /** Human readable DEX name, e.g. "Uniswap V2". */
  name: string;
  /** V2 factory contract. */
  factory: Address;
  /** V2 Router02 contract. */
  router: Address;
  /** Init code hash — reserved for off-chain pair address derivation. */
  initCodeHash?: `0x${string}`;
  /** LP swap fee in basis points (Uniswap V2 = 30 = 0.30%). */
  feeBps: number;
}

export interface ChainConfig {
  chainId: number;
  name: string;
  shortName: string;
  /** Native currency metadata (ETH, MATIC, BNB, ...). */
  nativeCurrency: { name: string; symbol: string; decimals: number };
  /** Wrapped native token address (WETH / WMATIC / WBNB ...). */
  weth: Address;
  /** Wrapped native token display symbol. */
  wrappedSymbol: string;
  /** Block explorer base URL, no trailing slash. */
  explorerUrl: string;
  explorerName: string;
  /** Default (primary) DEX used for this chain. */
  dex: DexConfig;
  /** CoinGecko platform id — used for optional token logo / price lookups. */
  coingeckoPlatform?: string;
  /** Native asset CoinGecko id, for USD gas pricing. */
  coingeckoNativeId?: string;
}

/**
 * Ethereum mainnet — Uniswap V2. This is the reference implementation.
 */
const ethereum: ChainConfig = {
  chainId: 1,
  name: "Ethereum",
  shortName: "Ethereum",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  wrappedSymbol: "WETH",
  explorerUrl: "https://etherscan.io",
  explorerName: "Etherscan",
  coingeckoPlatform: "ethereum",
  coingeckoNativeId: "ethereum",
  dex: {
    name: "Uniswap V2",
    factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    initCodeHash:
      "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f",
    feeBps: 30,
  },
};

/**
 * The following chains are pre-wired so the app is "multi-chain ready". They
 * all use a Uniswap V2-compatible fork. Flip them on by adding the chain to
 * `SUPPORTED_CHAIN_IDS` below once you have verified the addresses for your
 * deployment.
 */
const base: ChainConfig = {
  chainId: 8453,
  name: "Base",
  shortName: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  weth: "0x4200000000000000000000000000000000000006",
  wrappedSymbol: "WETH",
  explorerUrl: "https://basescan.org",
  explorerName: "BaseScan",
  coingeckoPlatform: "base",
  coingeckoNativeId: "ethereum",
  dex: {
    name: "Uniswap V2 (Base)",
    factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
    router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    feeBps: 30,
  },
};

const arbitrum: ChainConfig = {
  chainId: 42161,
  name: "Arbitrum One",
  shortName: "Arbitrum",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  wrappedSymbol: "WETH",
  explorerUrl: "https://arbiscan.io",
  explorerName: "Arbiscan",
  coingeckoPlatform: "arbitrum-one",
  coingeckoNativeId: "ethereum",
  dex: {
    name: "Uniswap V2 (Arbitrum)",
    factory: "0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9",
    router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    feeBps: 30,
  },
};

const optimism: ChainConfig = {
  chainId: 10,
  name: "Optimism",
  shortName: "Optimism",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  weth: "0x4200000000000000000000000000000000000006",
  wrappedSymbol: "WETH",
  explorerUrl: "https://optimistic.etherscan.io",
  explorerName: "Etherscan",
  coingeckoPlatform: "optimistic-ethereum",
  coingeckoNativeId: "ethereum",
  dex: {
    name: "Uniswap V2 (Optimism)",
    factory: "0x0c3c1c532F1e39EdF36BE9Fe0bE1410313E074Bf",
    router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    feeBps: 30,
  },
};

const polygon: ChainConfig = {
  chainId: 137,
  name: "Polygon",
  shortName: "Polygon",
  nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  weth: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  wrappedSymbol: "WMATIC",
  explorerUrl: "https://polygonscan.com",
  explorerName: "PolygonScan",
  coingeckoPlatform: "polygon-pos",
  coingeckoNativeId: "matic-network",
  dex: {
    name: "QuickSwap (V2)",
    factory: "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32",
    router: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff",
    feeBps: 30,
  },
};

const bsc: ChainConfig = {
  chainId: 56,
  name: "BNB Smart Chain",
  shortName: "BNB Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  weth: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  wrappedSymbol: "WBNB",
  explorerUrl: "https://bscscan.com",
  explorerName: "BscScan",
  coingeckoPlatform: "binance-smart-chain",
  coingeckoNativeId: "binancecoin",
  dex: {
    name: "PancakeSwap V2",
    factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
    router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    feeBps: 25,
  },
};

/** All known chain configs, keyed by chain id. */
export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  [ethereum.chainId]: ethereum,
  [base.chainId]: base,
  [arbitrum.chainId]: arbitrum,
  [optimism.chainId]: optimism,
  [polygon.chainId]: polygon,
  [bsc.chainId]: bsc,
};

/**
 * Chains the UI actively exposes. Ethereum ships enabled; the others are
 * pre-configured and can be enabled by adding their id here. Order matters —
 * the first id is treated as the default.
 */
export const SUPPORTED_CHAIN_IDS: number[] = [
  ethereum.chainId,
  base.chainId,
  arbitrum.chainId,
  optimism.chainId,
  polygon.chainId,
  bsc.chainId,
];

export const DEFAULT_CHAIN_ID: number = Number(
  process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? ethereum.chainId,
);

/** Look up a chain config or throw a descriptive error. */
export function getChainConfig(chainId: number): ChainConfig {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new Error(
      `Unsupported chain id ${chainId}. Add it to CHAIN_CONFIGS in constants/dex.ts.`,
    );
  }
  return config;
}

/** Non-throwing variant for render paths. */
export function tryGetChainConfig(
  chainId: number | undefined,
): ChainConfig | undefined {
  if (chainId == null) return undefined;
  return CHAIN_CONFIGS[chainId];
}

export function isChainSupported(chainId: number | undefined): boolean {
  return chainId != null && SUPPORTED_CHAIN_IDS.includes(chainId);
}
