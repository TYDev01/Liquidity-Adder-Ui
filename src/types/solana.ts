import type {
  Connection,
  Signer,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { PoolModel, SolanaPlatformId } from "@/constants/solana";

/**
 * Solana-side domain types.
 *
 * These deliberately mirror the EVM types in `types/index.ts` in spirit, but
 * they are not shared: an SPL mint is not an ERC-20, and concentrated/bin
 * venues have no single "LP token balance" to speak of. The adapter interface
 * at the bottom is the contract every venue implements.
 */

/* -------------------------------------------------------------------------- */
/*                                   Tokens                                   */
/* -------------------------------------------------------------------------- */

/** Metadata + live balance for a discovered SPL mint. */
export interface SolanaTokenInfo {
  /** Mint address, base58. */
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  /** Raw total supply, in base units. */
  supply: bigint;
  /** Connected wallet's balance, in base units. */
  balance?: bigint;
  logoURI?: string;
  /** True for Token-2022 mints (different program id, may carry extensions). */
  isToken2022: boolean;
  /**
   * Names of the Token-2022 extensions on the mint. AMM programs accept only a
   * short whitelist, so this decides which venues can host the token at all.
   */
  extensions?: string[];
  /**
   * Token-2022 transfer-fee basis points, when the mint charges one. Deposits
   * into an AMM are transfers, so a fee here silently reduces what lands in
   * the pool — the UI warns when this is set.
   */
  transferFeeBps?: number;
  /** Whether the mint authority is still live (supply can be inflated). */
  hasMintAuthority: boolean;
  /** Whether the freeze authority is still live (accounts can be frozen). */
  hasFreezeAuthority: boolean;
}

/* -------------------------------------------------------------------------- */
/*                                    Pools                                   */
/* -------------------------------------------------------------------------- */

/** A pool as returned by discovery. Cheap to list, may omit live state. */
export interface SolanaPoolSummary {
  /** Pool account address, base58. */
  id: string;
  platform: SolanaPlatformId;
  poolModel: PoolModel;
  mintA: string;
  mintB: string;
  symbolA: string;
  symbolB: string;
  decimalsA: number;
  decimalsB: number;
  /** Swap fee in basis points. */
  feeBps: number;
  /** Tick spacing / bin step / config index, per venue. */
  tierKey?: number;
  /** Total value locked, USD, when the venue's API reports it. */
  tvlUsd?: number;
  /** 24h volume, USD. */
  volume24hUsd?: number;
  /** Annualised fee yield, percent. */
  apr?: number;
  /** Price of 1 mintA denominated in mintB. */
  price: number;
}

/** Live pool state plus the connected wallet's positions in it. */
export interface SolanaPoolDetail extends SolanaPoolSummary {
  /** Reserve of mintA, base units. */
  reserveA: bigint;
  /** Reserve of mintB, base units. */
  reserveB: bigint;
  /** Positions the connected wallet holds in this pool. */
  positions: SolanaPosition[];
  /** Current tick / active bin id, for concentrated and bin venues. */
  currentTick?: number;
  /** LP mint, for constant-product venues only. */
  lpMint?: string;
  lpSupply?: bigint;
}

/**
 * One position. For constant-product venues a wallet has at most one (its LP
 * token balance); concentrated and bin venues can have many, each with its own
 * price band.
 */
export interface SolanaPosition {
  /** LP mint for CP pools; position NFT mint / PDA otherwise. */
  id: string;
  /** Raw liquidity units — LP tokens, or `L` for concentrated venues. */
  liquidity: bigint;
  /** Currently redeemable amount of mintA, base units. */
  amountA: bigint;
  /** Currently redeemable amount of mintB, base units. */
  amountB: bigint;
  /** Share of the pool, 0..1. Only meaningful for constant-product venues. */
  poolShare?: number;
  /** Lower bound of the position's price band (B per A). */
  lowerPrice?: number;
  /** Upper bound of the position's price band (B per A). */
  upperPrice?: number;
  lowerTick?: number;
  upperTick?: number;
  /** False when the pool price has moved outside the band (earning no fees). */
  inRange?: boolean;
  /** Unclaimed fees, base units. */
  feesA?: bigint;
  feesB?: bigint;
}

/* -------------------------------------------------------------------------- */
/*                                   Quotes                                   */
/* -------------------------------------------------------------------------- */

/** A quote for depositing into a pool. */
export interface SolanaAddQuote {
  /** Amount of mintA to deposit, base units. */
  amountA: bigint;
  /** Amount of mintB to deposit, base units. */
  amountB: bigint;
  /** Slippage-adjusted maximums the transaction will authorise. */
  maxAmountA: bigint;
  maxAmountB: bigint;
  /** Liquidity units minted. */
  liquidity: bigint;
  /** Resulting pool share, 0..1. Undefined where not meaningful. */
  poolShare?: number;
  /** True when this deposit creates the pool. */
  isInitialLiquidity: boolean;
  /** Price band actually used (concentrated/bin venues). */
  lowerPrice?: number;
  upperPrice?: number;
  lowerTick?: number;
  upperTick?: number;
  /** Set when the venue can't take both sides at the requested ratio. */
  warning?: string;
}

/** A quote for withdrawing from a pool. */
export interface SolanaRemoveQuote {
  /** Liquidity units burned. */
  liquidity: bigint;
  amountA: bigint;
  amountB: bigint;
  minAmountA: bigint;
  minAmountB: bigint;
  /** Fees claimed alongside the withdrawal, when the venue bundles them. */
  feesA?: bigint;
  feesB?: bigint;
  /** True when the whole position is withdrawn and the account is closed. */
  closesPosition: boolean;
}

/* -------------------------------------------------------------------------- */
/*                              Adapter interface                             */
/* -------------------------------------------------------------------------- */

/** Anything a wallet must provide for an adapter to build and sign. */
export interface AdapterWallet {
  publicKey: PublicKey;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(
    txs: T[],
  ) => Promise<T[]>;
  signTransaction: <T extends Transaction | VersionedTransaction>(
    tx: T,
  ) => Promise<T>;
}

/** Everything an adapter needs to talk to the chain. */
export interface AdapterContext {
  connection: Connection;
  wallet: AdapterWallet;
}

/** Read-only context — enough for discovery and quoting without a wallet. */
export interface ReadContext {
  connection: Connection;
  owner?: PublicKey;
}

export interface FindPoolsParams {
  /** The token the user pasted. */
  mint: string;
  /** The asset to pair against (SOL/USDC/USDT). */
  quoteMint: string;
}

export interface AddParams {
  pool: SolanaPoolDetail;
  quote: SolanaAddQuote;
  slippagePercent: number;
  /** Existing position to add to; omit to open a new one. */
  positionId?: string;
}

export interface RemoveParams {
  pool: SolanaPoolDetail;
  position: SolanaPosition;
  /** Fraction of the position to withdraw, 0..1. */
  fraction: number;
  slippagePercent: number;
}

export interface CreatePoolParams {
  tokenA: SolanaTokenInfo;
  tokenB: SolanaTokenInfo;
  /** Initial deposit of mintA, base units. */
  amountA: bigint;
  /** Initial deposit of mintB, base units — sets the opening price. */
  amountB: bigint;
  /** Venue-specific tier: tick spacing, bin step, or config index. */
  tierKey: number;
  /** Price band for concentrated/bin venues. */
  lowerPrice?: number;
  upperPrice?: number;
  slippagePercent: number;
}

export interface QuoteAddParams {
  pool: SolanaPoolDetail;
  /** Which side the user typed into. */
  inputSide: "A" | "B";
  /** Typed amount, base units. */
  inputAmount: bigint;
  slippagePercent: number;
  /** Price band, for concentrated/bin venues. */
  lowerPrice?: number;
  upperPrice?: number;
  /** Adding to an existing position rather than opening one. */
  positionId?: string;
}

/** A set of transactions to sign and send in order. */
export interface BuiltTransactions {
  transactions: (Transaction | VersionedTransaction)[];
  /** Human description of each step, for multi-tx flows. */
  labels: string[];
  /**
   * Extra signers each transaction needs beyond the wallet — position NFT
   * mints and pool state accounts are generated client-side and must sign.
   *
   * These are applied by the runner *after* it stamps a fresh blockhash and
   * *before* the wallet signs; partial-signing earlier would be invalidated
   * the moment the blockhash changes. Indexed to match `transactions`.
   */
  extraSigners?: Signer[][];
}

/**
 * The contract every venue implements. The UI and hooks only ever talk to
 * this — no venue-specific branching leaks upward.
 */
export interface LiquidityAdapter {
  readonly id: SolanaPlatformId;

  /** List pools matching a pair. Read-only; no wallet required. */
  findPools(ctx: ReadContext, params: FindPoolsParams): Promise<SolanaPoolSummary[]>;

  /** Load live state and the owner's positions for one pool. */
  loadPool(ctx: ReadContext, summary: SolanaPoolSummary): Promise<SolanaPoolDetail>;

  /** Quote a deposit. Pure computation — no signing. */
  quoteAdd(ctx: ReadContext, params: QuoteAddParams): Promise<SolanaAddQuote>;

  /** Quote a withdrawal. */
  quoteRemove(
    ctx: ReadContext,
    params: RemoveParams,
  ): Promise<SolanaRemoveQuote>;

  /** Build the deposit transaction(s). */
  buildAdd(ctx: AdapterContext, params: AddParams): Promise<BuiltTransactions>;

  /** Build the withdrawal transaction(s). */
  buildRemove(
    ctx: AdapterContext,
    params: RemoveParams,
  ): Promise<BuiltTransactions>;

  /** Build pool-creation transaction(s). Throws if `supportsCreate` is false. */
  buildCreatePool(
    ctx: AdapterContext,
    params: CreatePoolParams,
  ): Promise<BuiltTransactions>;
}

/* -------------------------------------------------------------------------- */
/*                              Activity logging                              */
/* -------------------------------------------------------------------------- */

export type SolanaLiquidityAction = "create" | "add" | "remove" | "claim";

/** A locally persisted Solana transaction record. */
export interface StoredSolanaTransaction {
  signature: string;
  platform: SolanaPlatformId;
  action: SolanaLiquidityAction;
  tokenSymbol: string;
  mint: string;
  status: "pending" | "confirmed" | "failed";
  createdAt: number;
}
