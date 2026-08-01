import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import Decimal from "decimal.js";
import {
  Raydium,
  TxVersion,
  Percent,
  PoolUtils,
  CREATE_CPMM_POOL_PROGRAM,
  CREATE_CPMM_POOL_FEE_ACC,
  CLMM_PROGRAM_ID,
  type ApiV3PoolInfoConcentratedItem,
  type ApiV3PoolInfoStandardItemCpmm,
  type ApiV3Token,
} from "@raydium-io/raydium-sdk-v2";
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
import type { SolanaTokenInfo } from "@/types/solana";
import { fetchRaydiumPools } from "./raydiumApi";
import {
  applySlippageDown,
  applySlippageUp,
  fullRangeTicks,
  pairedAmount,
  poolShareAfterDeposit,
  snapToSpacing,
  tickToUiPrice,
  uiPriceToTick,
} from "./shared";
import { fetchTokenBalance } from "../tokenService";

/**
 * Raydium adapters — CPMM (constant product) and CLMM (concentrated).
 *
 * Both are built on one `Raydium` client instance. The SDK is stateful and
 * relatively expensive to construct (it warms caches and fetches chain time),
 * so instances are memoised per owner rather than per call.
 *
 * Every write path returns the SDK's prepared `transaction` rather than calling
 * its `execute()` helper: signing, sending and confirmation belong to the app's
 * shared runner so the two ecosystems present identical transaction UX.
 */

const TX_VERSION = TxVersion.V0;

/* -------------------------------------------------------------------------- */
/*                                 SDK client                                 */
/* -------------------------------------------------------------------------- */

let cachedClient: { key: string; client: Promise<Raydium> } | undefined;

function clientKey(ctx: ReadContext | AdapterContext): string {
  const owner =
    "wallet" in ctx ? ctx.wallet.publicKey.toBase58() : (ctx.owner?.toBase58() ?? "anon");
  return owner;
}

async function getClient(ctx: ReadContext | AdapterContext): Promise<Raydium> {
  const key = clientKey(ctx);
  if (cachedClient?.key === key) return cachedClient.client;

  const isWrite = "wallet" in ctx;
  const client = Raydium.load({
    connection: ctx.connection,
    owner: isWrite ? ctx.wallet.publicKey : ctx.owner,
    signAllTransactions: isWrite ? ctx.wallet.signAllTransactions : undefined,
    // The token list is a multi-megabyte download we never use — pool metadata
    // comes from the pool records themselves.
    disableLoadToken: true,
    blockhashCommitment: "confirmed",
  });

  cachedClient = { key, client };
  return client;
}

function toBN(value: bigint): BN {
  return new BN(value.toString());
}

function toBigInt(value: BN): bigint {
  return BigInt(value.toString());
}

/** Slippage as the SDK's `Percent` (numerator/denominator) type. */
function toPercent(percent: number): Percent {
  return new Percent(Math.round(percent * 100), 10_000);
}

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/**
 * Shape one of our tokens as the SDK's `ApiV3Token`. Pool creation reads the
 * address, decimals and owning program; the remaining fields are display
 * metadata the SDK carries through untouched.
 */
function toApiToken(token: SolanaTokenInfo): ApiV3Token {
  return {
    chainId: 101,
    address: token.mint,
    programId: token.isToken2022 ? TOKEN_2022_PROGRAM : TOKEN_PROGRAM,
    logoURI: token.logoURI ?? "",
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    tags: [],
    extensions: {},
  };
}

/* -------------------------------------------------------------------------- */
/*                                    CPMM                                    */
/* -------------------------------------------------------------------------- */

export const raydiumCpmmAdapter: LiquidityAdapter = {
  id: "raydium-cpmm",

  async findPools(
    _ctx: ReadContext,
    params: FindPoolsParams,
  ): Promise<SolanaPoolSummary[]> {
    const all = await fetchRaydiumPools(params.mint, params.quoteMint);
    return all.filter((p) => p.platform === "raydium-cpmm");
  },

  async loadPool(
    ctx: ReadContext,
    summary: SolanaPoolSummary,
  ): Promise<SolanaPoolDetail> {
    const raydium = await getClient(ctx);
    const { poolInfo, rpcData } = await raydium.cpmm.getPoolInfoFromRpc(
      summary.id,
    );

    const lpMint = poolInfo.lpMint.address;
    const lpSupply = toBigInt(rpcData.lpAmount);

    // A CPMM position is just an LP token balance.
    const positions: SolanaPosition[] = [];
    if (ctx.owner) {
      const lpBalance = await fetchTokenBalance(
        ctx.connection,
        new PublicKey(lpMint),
        ctx.owner,
      );

      if (lpBalance > 0n) {
        const share =
          lpSupply > 0n
            ? Number((lpBalance * 1_000_000n) / lpSupply) / 1_000_000
            : 0;
        positions.push({
          id: lpMint,
          liquidity: lpBalance,
          amountA: (toBigInt(rpcData.baseReserve) * lpBalance) / (lpSupply || 1n),
          amountB:
            (toBigInt(rpcData.quoteReserve) * lpBalance) / (lpSupply || 1n),
          poolShare: share,
        });
      }
    }

    return {
      ...summary,
      reserveA: toBigInt(rpcData.baseReserve),
      reserveB: toBigInt(rpcData.quoteReserve),
      price: rpcData.poolPrice.toNumber(),
      lpMint,
      lpSupply,
      positions,
    };
  },

  async quoteAdd(
    _ctx: ReadContext,
    params: QuoteAddParams,
  ): Promise<SolanaAddQuote> {
    const { pool, inputAmount, inputSide, slippagePercent } = params;

    const isFirstDeposit = pool.reserveA === 0n || pool.reserveB === 0n;
    if (isFirstDeposit) {
      // Nothing to anchor a ratio to — the depositor sets the opening price.
      return {
        amountA: inputSide === "A" ? inputAmount : 0n,
        amountB: inputSide === "B" ? inputAmount : 0n,
        maxAmountA: inputSide === "A" ? inputAmount : 0n,
        maxAmountB: inputSide === "B" ? inputAmount : 0n,
        liquidity: inputAmount,
        isInitialLiquidity: true,
      };
    }

    const amountA =
      inputSide === "A"
        ? inputAmount
        : pairedAmount(inputAmount, pool.reserveB, pool.reserveA);
    const amountB =
      inputSide === "B"
        ? inputAmount
        : pairedAmount(inputAmount, pool.reserveA, pool.reserveB);

    // LP minted is proportional to the share of reserves contributed.
    const liquidity =
      pool.lpSupply && pool.reserveA > 0n
        ? (amountA * pool.lpSupply) / pool.reserveA
        : amountA;

    return {
      amountA,
      amountB,
      maxAmountA: applySlippageUp(amountA, slippagePercent),
      maxAmountB: applySlippageUp(amountB, slippagePercent),
      liquidity,
      poolShare: poolShareAfterDeposit(liquidity, pool.lpSupply ?? 0n),
      isInitialLiquidity: false,
    };
  },

  async quoteRemove(
    _ctx: ReadContext,
    params: RemoveParams,
  ): Promise<SolanaRemoveQuote> {
    const { pool, position, fraction, slippagePercent } = params;
    const bps = BigInt(Math.round(fraction * 10_000));
    const liquidity = (position.liquidity * bps) / 10_000n;

    const supply = pool.lpSupply ?? 0n;
    const amountA = supply > 0n ? (pool.reserveA * liquidity) / supply : 0n;
    const amountB = supply > 0n ? (pool.reserveB * liquidity) / supply : 0n;

    return {
      liquidity,
      amountA,
      amountB,
      minAmountA: applySlippageDown(amountA, slippagePercent),
      minAmountB: applySlippageDown(amountB, slippagePercent),
      closesPosition: fraction >= 1,
    };
  },

  async buildAdd(
    ctx: AdapterContext,
    params: AddParams,
  ): Promise<BuiltTransactions> {
    const { pool, quote, slippagePercent } = params;
    const raydium = await getClient(ctx);
    const { poolInfo, poolKeys } = await raydium.cpmm.getPoolInfoFromRpc(pool.id);

    const { transaction } = await raydium.cpmm.addLiquidity({
      poolInfo: poolInfo as ApiV3PoolInfoStandardItemCpmm,
      poolKeys,
      inputAmount: toBN(quote.amountA),
      baseIn: true,
      slippage: toPercent(slippagePercent),
      txVersion: TX_VERSION,
    });

    return { transactions: [transaction], labels: ["Add liquidity"] };
  },

  async buildRemove(
    ctx: AdapterContext,
    params: RemoveParams,
  ): Promise<BuiltTransactions> {
    const { pool, position, fraction, slippagePercent } = params;
    const raydium = await getClient(ctx);
    const { poolInfo, poolKeys } = await raydium.cpmm.getPoolInfoFromRpc(pool.id);

    const lpAmount = (position.liquidity * BigInt(Math.round(fraction * 10_000))) / 10_000n;

    const { transaction } = await raydium.cpmm.withdrawLiquidity({
      poolInfo: poolInfo as ApiV3PoolInfoStandardItemCpmm,
      poolKeys,
      lpAmount: toBN(lpAmount),
      slippage: toPercent(slippagePercent),
      txVersion: TX_VERSION,
      // Unwrap to native SOL when the pair holds wrapped SOL.
      closeWsol: true,
    });

    return { transactions: [transaction], labels: ["Remove liquidity"] };
  },

  async buildCreatePool(
    ctx: AdapterContext,
    params: CreatePoolParams,
  ): Promise<BuiltTransactions> {
    const { tokenA, tokenB, amountA, amountB, tierKey } = params;
    const raydium = await getClient(ctx);

    // Fee tiers are on-chain config accounts; pick the one the user selected.
    const configs = await raydium.api.getCpmmConfigs();
    const feeConfig = configs[tierKey] ?? configs[0];
    if (!feeConfig) {
      throw new Error("Raydium returned no CPMM fee configs. Try again.");
    }

    const { transaction } = await raydium.cpmm.createPool({
      programId: CREATE_CPMM_POOL_PROGRAM,
      poolFeeAccount: CREATE_CPMM_POOL_FEE_ACC,
      mintA: toApiToken(tokenA),
      mintB: toApiToken(tokenB),
      mintAAmount: toBN(amountA),
      mintBAmount: toBN(amountB),
      startTime: new BN(0),
      feeConfig,
      associatedOnly: false,
      ownerInfo: { useSOLBalance: true },
      txVersion: TX_VERSION,
    });

    return {
      transactions: [transaction],
      labels: ["Create pool and deposit"],
    };
  },
};

/* -------------------------------------------------------------------------- */
/*                                    CLMM                                    */
/* -------------------------------------------------------------------------- */

export const raydiumClmmAdapter: LiquidityAdapter = {
  id: "raydium-clmm",

  async findPools(
    _ctx: ReadContext,
    params: FindPoolsParams,
  ): Promise<SolanaPoolSummary[]> {
    const all = await fetchRaydiumPools(params.mint, params.quoteMint);
    return all.filter((p) => p.platform === "raydium-clmm");
  },

  async loadPool(
    ctx: ReadContext,
    summary: SolanaPoolSummary,
  ): Promise<SolanaPoolDetail> {
    const raydium = await getClient(ctx);
    const { poolInfo, rpcPoolInfo } = await raydium.clmm.getPoolInfoFromRpc(
      summary.id,
    );

    const tickSpacing = poolInfo.config.tickSpacing;

    const positions: SolanaPosition[] = [];
    if (ctx.owner) {
      const owned = await raydium.clmm.getOwnerPositionInfo({
        programId: poolInfo.programId,
      });

      const mine = owned.filter((p) => p.poolId.toBase58() === summary.id);
      for (const position of mine) {
        const amounts = await PoolUtils.getAmountsFromLiquidity({
          epochInfo: await raydium.fetchEpochInfo(),
          poolInfo: poolInfo as ApiV3PoolInfoConcentratedItem,
          tickLower: position.tickLower,
          tickUpper: position.tickUpper,
          liquidity: position.liquidity,
          slippage: 0,
          add: false,
        });

        positions.push({
          id: position.nftMint.toBase58(),
          liquidity: toBigInt(position.liquidity),
          amountA: toBigInt(amounts.amountA.amount),
          amountB: toBigInt(amounts.amountB.amount),
          lowerTick: position.tickLower,
          upperTick: position.tickUpper,
          lowerPrice: tickToUiPrice(
            position.tickLower,
            summary.decimalsA,
            summary.decimalsB,
          ),
          upperPrice: tickToUiPrice(
            position.tickUpper,
            summary.decimalsA,
            summary.decimalsB,
          ),
          inRange:
            rpcPoolInfo.tickCurrent >= position.tickLower &&
            rpcPoolInfo.tickCurrent <= position.tickUpper,
        });
      }
    }

    return {
      ...summary,
      reserveA: 0n,
      reserveB: 0n,
      price: poolInfo.price,
      currentTick: rpcPoolInfo.tickCurrent,
      tierKey: tickSpacing,
      positions,
    };
  },

  async quoteAdd(
    ctx: ReadContext,
    params: QuoteAddParams,
  ): Promise<SolanaAddQuote> {
    const { pool, inputAmount, inputSide, slippagePercent } = params;
    const raydium = await getClient(ctx);
    const { poolInfo } = await raydium.clmm.getPoolInfoFromRpc(pool.id);

    const tickSpacing = poolInfo.config.tickSpacing;
    const { lowerTick, upperTick } = resolveTicks(
      params.lowerPrice,
      params.upperPrice,
      pool.decimalsA,
      pool.decimalsB,
      tickSpacing,
    );

    const result = await PoolUtils.getLiquidityAmountOutFromAmountIn({
      poolInfo: poolInfo as ApiV3PoolInfoConcentratedItem,
      inputA: inputSide === "A",
      tickLower: lowerTick,
      tickUpper: upperTick,
      amount: toBN(inputAmount),
      slippage: slippagePercent / 100,
      add: true,
      epochInfo: await raydium.fetchEpochInfo(),
      amountHasFee: true,
    });

    return {
      amountA: toBigInt(result.amountA.amount),
      amountB: toBigInt(result.amountB.amount),
      maxAmountA: toBigInt(result.amountSlippageA.amount),
      maxAmountB: toBigInt(result.amountSlippageB.amount),
      liquidity: toBigInt(result.liquidity),
      isInitialLiquidity: false,
      lowerTick,
      upperTick,
      lowerPrice: tickToUiPrice(lowerTick, pool.decimalsA, pool.decimalsB),
      upperPrice: tickToUiPrice(upperTick, pool.decimalsA, pool.decimalsB),
    };
  },

  async quoteRemove(
    ctx: ReadContext,
    params: RemoveParams,
  ): Promise<SolanaRemoveQuote> {
    const { pool, position, fraction, slippagePercent } = params;
    const raydium = await getClient(ctx);
    const { poolInfo } = await raydium.clmm.getPoolInfoFromRpc(pool.id);

    const liquidity =
      (position.liquidity * BigInt(Math.round(fraction * 10_000))) / 10_000n;

    const amounts = await PoolUtils.getAmountsFromLiquidity({
      epochInfo: await raydium.fetchEpochInfo(),
      poolInfo: poolInfo as ApiV3PoolInfoConcentratedItem,
      tickLower: position.lowerTick!,
      tickUpper: position.upperTick!,
      liquidity: toBN(liquidity),
      slippage: slippagePercent / 100,
      add: false,
    });

    return {
      liquidity,
      amountA: toBigInt(amounts.amountA.amount),
      amountB: toBigInt(amounts.amountB.amount),
      minAmountA: toBigInt(amounts.amountSlippageA.amount),
      minAmountB: toBigInt(amounts.amountSlippageB.amount),
      closesPosition: fraction >= 1,
    };
  },

  async buildAdd(
    ctx: AdapterContext,
    params: AddParams,
  ): Promise<BuiltTransactions> {
    const { pool, quote, positionId } = params;
    const raydium = await getClient(ctx);
    const { poolInfo, poolKeys } = await raydium.clmm.getPoolInfoFromRpc(pool.id);

    // Adding to an existing position reuses its NFT; otherwise open a new one.
    if (positionId) {
      const owned = await raydium.clmm.getOwnerPositionInfo({
        programId: poolInfo.programId,
      });
      const ownerPosition = owned.find(
        (p) => p.nftMint.toBase58() === positionId,
      );
      if (!ownerPosition) {
        throw new Error("That position no longer exists on-chain.");
      }

      const { transaction } = await raydium.clmm.increasePositionFromBase({
        poolInfo: poolInfo as ApiV3PoolInfoConcentratedItem,
        // `getOwnerPositionInfo` returns the decoded account; the richer
        // display fields on `ClmmPoolPersonalPosition` are unused by this call.
        ownerPosition: ownerPosition as unknown as Parameters<
          typeof raydium.clmm.increasePositionFromBase
        >[0]["ownerPosition"],
        ownerInfo: { useSOLBalance: true },
        base: "MintA",
        baseAmount: toBN(quote.amountA),
        otherAmountMax: toBN(quote.maxAmountB),
        txVersion: TX_VERSION,
      });

      return { transactions: [transaction], labels: ["Add to position"] };
    }

    const { transaction } = await raydium.clmm.openPositionFromBase({
      poolInfo: poolInfo as ApiV3PoolInfoConcentratedItem,
      poolKeys,
      tickLower: quote.lowerTick!,
      tickUpper: quote.upperTick!,
      base: "MintA",
      baseAmount: toBN(quote.amountA),
      otherAmountMax: toBN(quote.maxAmountB),
      ownerInfo: { useSOLBalance: true },
      txVersion: TX_VERSION,
    });

    return { transactions: [transaction], labels: ["Open position"] };
  },

  async buildRemove(
    ctx: AdapterContext,
    params: RemoveParams,
  ): Promise<BuiltTransactions> {
    const { pool, position, fraction, slippagePercent } = params;
    const raydium = await getClient(ctx);
    const { poolInfo, poolKeys } = await raydium.clmm.getPoolInfoFromRpc(pool.id);

    const owned = await raydium.clmm.getOwnerPositionInfo({
      programId: poolInfo.programId,
    });
    const ownerPosition = owned.find(
      (p) => p.nftMint.toBase58() === position.id,
    );
    if (!ownerPosition) {
      throw new Error("That position no longer exists on-chain.");
    }

    const liquidity =
      (position.liquidity * BigInt(Math.round(fraction * 10_000))) / 10_000n;

    const amounts = await PoolUtils.getAmountsFromLiquidity({
      epochInfo: await raydium.fetchEpochInfo(),
      poolInfo: poolInfo as ApiV3PoolInfoConcentratedItem,
      tickLower: ownerPosition.tickLower,
      tickUpper: ownerPosition.tickUpper,
      liquidity: toBN(liquidity),
      slippage: slippagePercent / 100,
      add: false,
    });

    const { transaction } = await raydium.clmm.decreaseLiquidity({
      poolInfo: poolInfo as ApiV3PoolInfoConcentratedItem,
      poolKeys,
      ownerPosition,
      liquidity: toBN(liquidity),
      amountMinA: amounts.amountSlippageA.amount,
      amountMinB: amounts.amountSlippageB.amount,
      ownerInfo: {
        useSOLBalance: true,
        // Burning the whole position also reclaims the NFT's rent.
        closePosition: fraction >= 1,
      },
      txVersion: TX_VERSION,
    });

    return {
      transactions: [transaction],
      labels: [fraction >= 1 ? "Close position" : "Remove liquidity"],
    };
  },

  async buildCreatePool(
    ctx: AdapterContext,
    params: CreatePoolParams,
  ): Promise<BuiltTransactions> {
    const { tokenA, tokenB, amountA, amountB, tierKey } = params;
    const raydium = await getClient(ctx);

    const configs = await raydium.api.getClmmConfigs();
    const ammConfig = configs.find((c) => c.tickSpacing === tierKey) ?? configs[0];
    if (!ammConfig) {
      throw new Error("Raydium returned no CLMM configs. Try again.");
    }

    // The deposit ratio sets the opening price.
    const initialPrice = new Decimal(amountB.toString())
      .div(new Decimal(10).pow(tokenB.decimals))
      .div(
        new Decimal(amountA.toString()).div(
          new Decimal(10).pow(tokenA.decimals),
        ),
      );

    const { transaction } = await raydium.clmm.createPool({
      programId: CLMM_PROGRAM_ID,
      mint1: toApiToken(tokenA),
      mint2: toApiToken(tokenB),
      // The API's config record and the on-chain one differ slightly: the
      // former keys `id` as a string and omits two descriptive fields the
      // instruction builder expects.
      ammConfig: {
        ...ammConfig,
        id: new PublicKey(ammConfig.id),
        fundOwner: "",
        description: "",
      },
      initialPrice,
      txVersion: TX_VERSION,
    });

    return {
      transactions: [transaction],
      labels: ["Create CLMM pool"],
    };
  },
};

/**
 * Turn a user price band into spacing-aligned ticks, defaulting to the widest
 * range the pool allows when the user chose "full range".
 */
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
