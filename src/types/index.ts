import type { Address, Hash } from "viem";

/** Metadata + live balances for a discovered ERC-20 token. */
export interface TokenInfo {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  /** Connected wallet's balance, when a wallet is connected. */
  balance?: bigint;
  /** Whether the token exposes EIP-2612 `permit`. */
  supportsPermit?: boolean;
  /** Best-effort logo URI (Trust Wallet / token list). */
  logoURI?: string;
  chainId: number;
}

/** State of a token/WETH pool on the configured DEX. */
export interface PoolInfo {
  /** Pair (LP token) contract address. */
  pairAddress: Address;
  exists: boolean;
  token0: Address;
  token1: Address;
  /** Reserve of the ERC-20 token (already oriented to the queried token). */
  reserveToken: bigint;
  /** Reserve of WETH / wrapped native. */
  reserveWeth: bigint;
  /** LP token total supply. */
  totalSupply: bigint;
  /** Connected wallet's LP balance. */
  lpBalance?: bigint;
  /** Price of 1 token, denominated in native (ETH). */
  priceInEth: number;
  /** Price of 1 native (ETH), denominated in token. */
  priceInToken: number;
}

/** A quote for adding liquidity. */
export interface AddLiquidityQuote {
  /** Token amount, in wei. */
  amountTokenDesired: bigint;
  /** ETH amount, in wei. */
  amountEthDesired: bigint;
  amountTokenMin: bigint;
  amountEthMin: bigint;
  /** Estimated LP tokens minted. */
  liquidity: bigint;
  /** Resulting pool share, as a fraction (0..1). Undefined for first mint. */
  poolShare?: number;
  /** True when this is the very first liquidity added (pool being created). */
  isInitialLiquidity: boolean;
}

/** A quote for removing liquidity. */
export interface RemoveLiquidityQuote {
  /** LP tokens to burn. */
  liquidity: bigint;
  /** Expected token out, before slippage. */
  amountToken: bigint;
  /** Expected ETH out, before slippage. */
  amountEth: bigint;
  amountTokenMin: bigint;
  amountEthMin: bigint;
}

/** User-controlled transaction settings. */
export interface TransactionSettings {
  /** Slippage tolerance, percent. */
  slippagePercent: number;
  /** Deadline, minutes from submission. */
  deadlineMinutes: number;
}

/** Lifecycle stages surfaced to the user for every transaction. */
export type TxStage =
  | "idle"
  | "preparing"
  | "awaiting_signature"
  | "broadcasting"
  | "pending"
  | "confirmed"
  | "failed";

export type LiquidityAction = "approve" | "create" | "add" | "remove";

/** A locally persisted transaction record. */
export interface StoredTransaction {
  hash: Hash;
  chainId: number;
  action: LiquidityAction;
  /** Token symbol involved, for display. */
  tokenSymbol: string;
  tokenAddress: Address;
  status: "pending" | "confirmed" | "failed";
  createdAt: number;
}

/** A locally persisted token search-history / favorite entry. */
export interface TokenBookmark {
  address: Address;
  chainId: number;
  symbol: string;
  name: string;
  logoURI?: string;
  savedAt: number;
}

/** Gas estimate, enriched with USD conversion when a native price is known. */
export interface GasEstimate {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  /** Estimated cost in native wei. */
  costWei: bigint;
  /** Estimated cost in native units (ETH). */
  costEth: number;
  /** Estimated cost in USD, when a price feed is available. */
  costUsd?: number;
  /** Rough time to confirmation, seconds. */
  estimatedSeconds?: number;
}
