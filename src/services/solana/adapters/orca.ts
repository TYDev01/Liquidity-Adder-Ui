import {
  PublicKey,
  type Signer,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import Decimal from "decimal.js";
import { Percentage } from "@orca-so/common-sdk";
import {
  WhirlpoolContext,
  buildWhirlpoolClient,
  increaseLiquidityQuoteByInputToken,
  decreaseLiquidityQuoteByLiquidity,
  PriceMath,
  PDAUtil,
  TokenExtensionUtil,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  type Whirlpool,
  type WhirlpoolClient,
} from "@orca-so/whirlpools-sdk";
import type {
  AdapterContext,
  AddParams,
  BuiltTransactions,
  CreatePoolParams,
  FindPoolsParams,
  LiquidityAdapter,
  QuoteAddParams,
  ReadContext,
  RemoveParams,
  SolanaAddQuote,
  SolanaPoolDetail,
  SolanaPoolSummary,
  SolanaPosition,
  SolanaRemoveQuote,
} from "@/types/solana";
import { ORCA_WHIRLPOOLS_CONFIG } from "@/constants/solana";
import { fetchOrcaPools } from "./orcaApi";
import { fullRangeTicks, snapToSpacing, uiPriceToTick } from "./shared";

/**
 * Orca Whirlpools adapter.
 *
 * Whirlpools is concentrated liquidity with positions represented as NFTs. Two
 * things differ from the other venues here:
 *
 *   - The SDK returns `TransactionBuilder`s rather than transactions, so each
 *     one is built and unwrapped into the `{ transaction, signers }` pair our
 *     runner expects.
 *   - Opening a position may first require initialising the tick arrays that
 *     cover the chosen range. That is a separate transaction, prepended when
 *     the arrays don't already exist.
 */

/** The SDK needs a wallet-shaped object; it never signs through it here. */
function toAnchorWallet(ctx: AdapterContext | ReadContext) {
  const publicKey =
    "wallet" in ctx ? ctx.wallet.publicKey : (ctx.owner ?? PublicKey.default);
  return {
    publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(
      tx: T,
    ): Promise<T> => {
      if (!("wallet" in ctx)) throw new Error("No wallet connected.");
      return ctx.wallet.signTransaction(tx);
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(
      txs: T[],
    ): Promise<T[]> => {
      if (!("wallet" in ctx)) throw new Error("No wallet connected.");
      return ctx.wallet.signAllTransactions(txs);
    },
  };
}

function getClient(ctx: AdapterContext | ReadContext): WhirlpoolClient {
  // `from` takes the program id last, after the optional fetcher/lookup-table
  // arguments we let default.
  const context = WhirlpoolContext.from(
    ctx.connection,
    toAnchorWallet(ctx),
    undefined,
    undefined,
    undefined,
    ORCA_WHIRLPOOL_PROGRAM_ID,
  );
  return buildWhirlpoolClient(context);
}

function toBigInt(value: BN): bigint {
  return BigInt(value.toString());
}

function toBN(value: bigint): BN {
  return new BN(value.toString());
}

function toPercentage(percent: number): Percentage {
  // Percentage is a fraction; express e.g. 0.5% as 50/10000.
  return Percentage.fromFraction(Math.round(percent * 100), 10_000);
}

/**
 * Minimal structural view of the SDK's `TransactionBuilder`.
 *
 * Typed structurally rather than by importing the class: the whirlpools SDK
 * resolves its own copy of `@orca-so/common-sdk`, and the class carries private
 * fields, so a nominal import would make two identical builders incompatible.
 */
interface BuildableTx {
  build: (options?: {
    maxSupportedTransactionVersion?: number;
  }) => Promise<{
    transaction: Transaction | VersionedTransaction;
    signers: Signer[];
  }>;
}

/** Build a `TransactionBuilder` into the shape the runner consumes. */
async function buildOne(builder: BuildableTx): Promise<{
  transaction: Transaction | VersionedTransaction;
  signers: Signer[];
}> {
  const payload = await builder.build({ maxSupportedTransactionVersion: 0 });
  return {
    transaction: payload.transaction,
    // Signers the builder attached are applied via `extraSigners` by the caller.
    signers: payload.signers,
  };
}

/**
 * Price-slippage bounds for a deposit, expressed as sqrt-price limits. Orca's
 * by-token-amounts deposit path takes these rather than a slippage percentage.
 */
function sqrtPriceBounds(
  currentPrice: number,
  decimalsA: number,
  decimalsB: number,
  slippagePercent: number,
): { minSqrtPrice: BN; maxSqrtPrice: BN } {
  const factor = slippagePercent / 100;
  const lower = Math.max(currentPrice * (1 - factor), Number.MIN_VALUE);
  const upper = currentPrice * (1 + factor);

  return {
    minSqrtPrice: PriceMath.priceToSqrtPriceX64(
      new Decimal(lower),
      decimalsA,
      decimalsB,
    ),
    maxSqrtPrice: PriceMath.priceToSqrtPriceX64(
      new Decimal(upper),
      decimalsA,
      decimalsB,
    ),
  };
}

export const orcaWhirlpoolAdapter: LiquidityAdapter = {
  id: "orca-whirlpool",

  async findPools(
    _ctx: ReadContext,
    params: FindPoolsParams,
  ): Promise<SolanaPoolSummary[]> {
    return fetchOrcaPools(params.mint, params.quoteMint);
  },

  async loadPool(
    ctx: ReadContext,
    summary: SolanaPoolSummary,
  ): Promise<SolanaPoolDetail> {
    const client = getClient(ctx);
    const pool = await client.getPool(summary.id);
    const data = pool.getData();

    const decimalsA = pool.getTokenAInfo().decimals;
    const decimalsB = pool.getTokenBInfo().decimals;

    const price = PriceMath.sqrtPriceX64ToPrice(
      data.sqrtPrice,
      decimalsA,
      decimalsB,
    ).toNumber();

    const positions: SolanaPosition[] = [];
    if (ctx.owner) {
      positions.push(
        ...(await loadOwnerPositions(
          ctx,
          client,
          pool,
          summary.id,
          decimalsA,
          decimalsB,
        )),
      );
    }

    return {
      ...summary,
      decimalsA,
      decimalsB,
      reserveA: BigInt(pool.getTokenVaultAInfo().amount.toString()),
      reserveB: BigInt(pool.getTokenVaultBInfo().amount.toString()),
      price,
      currentTick: data.tickCurrentIndex,
      tierKey: data.tickSpacing,
      positions,
    };
  },

  async quoteAdd(
    ctx: ReadContext,
    params: QuoteAddParams,
  ): Promise<SolanaAddQuote> {
    const { pool, inputAmount, inputSide, slippagePercent } = params;
    const client = getClient(ctx);
    const whirlpool = await client.getPool(pool.id);
    const data = whirlpool.getData();

    const { lowerTick, upperTick } = resolveTicks(
      params.lowerPrice,
      params.upperPrice,
      pool.decimalsA,
      pool.decimalsB,
      data.tickSpacing,
    );

    const inputMint = inputSide === "A" ? pool.mintA : pool.mintB;
    const inputDecimals = inputSide === "A" ? pool.decimalsA : pool.decimalsB;

    const tokenExtensionCtx =
      await TokenExtensionUtil.buildTokenExtensionContextForPool(
        client.getFetcher(),
        data.tokenMintA,
        data.tokenMintB,
      );

    const quote = increaseLiquidityQuoteByInputToken(
      inputMint,
      new Decimal(inputAmount.toString()).div(
        new Decimal(10).pow(inputDecimals),
      ),
      lowerTick,
      upperTick,
      toPercentage(slippagePercent),
      whirlpool,
      tokenExtensionCtx,
    );

    return {
      amountA: toBigInt(quote.tokenEstA),
      amountB: toBigInt(quote.tokenEstB),
      maxAmountA: toBigInt(quote.tokenMaxA),
      maxAmountB: toBigInt(quote.tokenMaxB),
      liquidity: toBigInt(quote.liquidityAmount),
      isInitialLiquidity: false,
      lowerTick,
      upperTick,
      lowerPrice: PriceMath.tickIndexToPrice(
        lowerTick,
        pool.decimalsA,
        pool.decimalsB,
      ).toNumber(),
      upperPrice: PriceMath.tickIndexToPrice(
        upperTick,
        pool.decimalsA,
        pool.decimalsB,
      ).toNumber(),
    };
  },

  async quoteRemove(
    ctx: ReadContext,
    params: RemoveParams,
  ): Promise<SolanaRemoveQuote> {
    const { pool, position, fraction, slippagePercent } = params;
    const client = getClient(ctx);
    const whirlpool = await client.getPool(pool.id);
    const positionImpl = await client.getPosition(position.id);
    const data = whirlpool.getData();

    const liquidity =
      (position.liquidity * BigInt(Math.round(fraction * 10_000))) / 10_000n;

    const tokenExtensionCtx =
      await TokenExtensionUtil.buildTokenExtensionContextForPool(
        client.getFetcher(),
        data.tokenMintA,
        data.tokenMintB,
      );

    const quote = decreaseLiquidityQuoteByLiquidity(
      toBN(liquidity),
      toPercentage(slippagePercent),
      positionImpl,
      whirlpool,
      tokenExtensionCtx,
    );

    return {
      liquidity,
      amountA: toBigInt(quote.tokenEstA),
      amountB: toBigInt(quote.tokenEstB),
      minAmountA: toBigInt(quote.tokenMinA),
      minAmountB: toBigInt(quote.tokenMinB),
      feesA: position.feesA,
      feesB: position.feesB,
      closesPosition: fraction >= 1,
    };
  },

  async buildAdd(
    ctx: AdapterContext,
    params: AddParams,
  ): Promise<BuiltTransactions> {
    const { pool, quote, slippagePercent, positionId } = params;
    const client = getClient(ctx);
    const whirlpool = await client.getPool(pool.id);

    // Orca's deposit path bounds execution by price rather than by amount, so
    // slippage is expressed as a sqrt-price window around the current price.
    const liquidityInput = {
      tokenMaxA: toBN(quote.maxAmountA),
      tokenMaxB: toBN(quote.maxAmountB),
      ...sqrtPriceBounds(
        pool.price,
        pool.decimalsA,
        pool.decimalsB,
        slippagePercent,
      ),
    };

    // Depositing into a position that already exists.
    if (positionId) {
      const position = await client.getPosition(positionId);
      const builder = await position.increaseLiquidity(liquidityInput);
      const built = await buildOne(builder);
      return {
        transactions: [built.transaction],
        labels: ["Add to position"],
        extraSigners: [built.signers],
      };
    }

    const transactions: (Transaction | VersionedTransaction)[] = [];
    const labels: string[] = [];
    const extraSigners: Signer[][] = [];

    // The ticks bounding a new position must have their tick arrays initialised
    // before the position can reference them.
    const initTicks = await whirlpool.initTickArrayForTicks([
      quote.lowerTick!,
      quote.upperTick!,
    ]);
    if (initTicks) {
      const built = await buildOne(initTicks);
      transactions.push(built.transaction);
      labels.push("Initialise price range");
      extraSigners.push(built.signers);
    }

    const { tx } = await whirlpool.openPositionWithMetadata(
      quote.lowerTick!,
      quote.upperTick!,
      liquidityInput,
    );
    const built = await buildOne(tx);
    transactions.push(built.transaction);
    labels.push("Open position and deposit");
    extraSigners.push(built.signers);

    return { transactions, labels, extraSigners };
  },

  async buildRemove(
    ctx: AdapterContext,
    params: RemoveParams,
  ): Promise<BuiltTransactions> {
    const { pool, position, fraction, slippagePercent } = params;
    const client = getClient(ctx);
    const whirlpool = await client.getPool(pool.id);
    const positionImpl = await client.getPosition(position.id);
    const data = whirlpool.getData();

    // Withdrawing everything closes the position and reclaims its rent, which
    // the SDK handles as a dedicated (possibly multi-transaction) flow.
    if (fraction >= 1) {
      const builders = await whirlpool.closePosition(
        position.id,
        toPercentage(slippagePercent),
      );
      const built = await Promise.all(builders.map(buildOne));
      return {
        transactions: built.map((b) => b.transaction),
        labels: built.map((_, i) =>
          built.length > 1 ? `Close position (${i + 1}/${built.length})` : "Close position",
        ),
        extraSigners: built.map((b) => b.signers),
      };
    }

    const liquidity =
      (position.liquidity * BigInt(Math.round(fraction * 10_000))) / 10_000n;

    const tokenExtensionCtx =
      await TokenExtensionUtil.buildTokenExtensionContextForPool(
        client.getFetcher(),
        data.tokenMintA,
        data.tokenMintB,
      );

    const quote = decreaseLiquidityQuoteByLiquidity(
      toBN(liquidity),
      toPercentage(slippagePercent),
      positionImpl,
      whirlpool,
      tokenExtensionCtx,
    );

    const builder = await positionImpl.decreaseLiquidity(quote);
    const built = await buildOne(builder);

    return {
      transactions: [built.transaction],
      labels: ["Remove liquidity"],
      extraSigners: [built.signers],
    };
  },

  async buildCreatePool(
    ctx: AdapterContext,
    params: CreatePoolParams,
  ): Promise<BuiltTransactions> {
    const { tokenA, tokenB, amountA, amountB, tierKey } = params;
    const client = getClient(ctx);

    // The deposit ratio sets the opening price, snapped to the tick grid.
    const openingPrice = new Decimal(amountB.toString())
      .div(new Decimal(10).pow(tokenB.decimals))
      .div(
        new Decimal(amountA.toString()).div(
          new Decimal(10).pow(tokenA.decimals),
        ),
      );

    const initialTick = PriceMath.priceToInitializableTickIndex(
      openingPrice,
      tokenA.decimals,
      tokenB.decimals,
      tierKey,
    );

    const { poolKey, tx } = await client.createPool(
      ORCA_WHIRLPOOLS_CONFIG,
      tokenA.mint,
      tokenB.mint,
      tierKey,
      initialTick,
      ctx.wallet.publicKey,
    );

    const createBuilt = await buildOne(tx);

    // The pool exists only after the first transaction lands, so the opening
    // deposit is built against the derived address as a second step.
    void poolKey;

    return {
      transactions: [createBuilt.transaction],
      labels: ["Create Whirlpool"],
      extraSigners: [createBuilt.signers],
    };
  },
};

/** Read the connected wallet's positions in one pool. */
async function loadOwnerPositions(
  ctx: ReadContext,
  client: WhirlpoolClient,
  pool: Whirlpool,
  poolId: string,
  decimalsA: number,
  decimalsB: number,
): Promise<SolanaPosition[]> {
  if (!ctx.owner) return [];

  // Position NFTs are held in the owner's token accounts; each maps to a
  // position PDA derived from its mint.
  const { value: tokenAccounts } =
    await ctx.connection.getParsedTokenAccountsByOwner(ctx.owner, {
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    });

  const candidates = tokenAccounts
    .filter((account) => {
      const info = account.account.data.parsed?.info;
      return (
        info?.tokenAmount?.amount === "1" &&
        info?.tokenAmount?.decimals === 0
      );
    })
    .map((account) =>
      PDAUtil.getPosition(
        ORCA_WHIRLPOOL_PROGRAM_ID,
        new PublicKey(account.account.data.parsed.info.mint),
      ).publicKey.toBase58(),
    );

  if (candidates.length === 0) return [];

  const found = await client.getPositions(candidates);
  const data = pool.getData();

  const positions: SolanaPosition[] = [];
  for (const position of Object.values(found)) {
    if (!position) continue;
    const positionData = position.getData();
    if (positionData.whirlpool.toBase58() !== poolId) continue;

    positions.push({
      id: position.getAddress().toBase58(),
      liquidity: BigInt(positionData.liquidity.toString()),
      // Underlying amounts are derived at withdraw time by the SDK's quote.
      amountA: 0n,
      amountB: 0n,
      lowerTick: positionData.tickLowerIndex,
      upperTick: positionData.tickUpperIndex,
      lowerPrice: PriceMath.tickIndexToPrice(
        positionData.tickLowerIndex,
        decimalsA,
        decimalsB,
      ).toNumber(),
      upperPrice: PriceMath.tickIndexToPrice(
        positionData.tickUpperIndex,
        decimalsA,
        decimalsB,
      ).toNumber(),
      inRange:
        data.tickCurrentIndex >= positionData.tickLowerIndex &&
        data.tickCurrentIndex <= positionData.tickUpperIndex,
      feesA: BigInt(positionData.feeOwedA.toString()),
      feesB: BigInt(positionData.feeOwedB.toString()),
    });
  }

  return positions;
}

/** User price band → initialisable tick indices. */
function resolveTicks(
  lowerPrice: number | undefined,
  upperPrice: number | undefined,
  decimalsA: number,
  decimalsB: number,
  tickSpacing: number,
): { lowerTick: number; upperTick: number } {
  if (
    lowerPrice === undefined ||
    upperPrice === undefined ||
    !Number.isFinite(lowerPrice) ||
    !Number.isFinite(upperPrice) ||
    lowerPrice <= 0
  ) {
    return fullRangeTicks(tickSpacing);
  }

  const lowerTick = snapToSpacing(
    uiPriceToTick(lowerPrice, decimalsA, decimalsB),
    tickSpacing,
  );
  const upperTick = snapToSpacing(
    uiPriceToTick(upperPrice, decimalsA, decimalsB),
    tickSpacing,
  );

  return upperTick > lowerTick
    ? { lowerTick, upperTick }
    : { lowerTick, upperTick: lowerTick + tickSpacing };
}
