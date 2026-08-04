import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  CpAmm,
  derivePositionAddress,
  derivePositionNftAccount,
  getTokenProgram,
  type PoolState,
} from "@meteora-ag/cp-amm-sdk";
import type {
  AdapterContext,
  AddParams,
  BuiltTransactions,
  CreatePoolParams,
  FindPoolsParams,
  LiquidityAdapter,
  OwnerContext,
  QuoteAddParams,
  ReadContext,
  RemoveParams,
  SolanaAddQuote,
  SolanaPoolDetail,
  SolanaPoolSummary,
  SolanaPosition,
  SolanaRemoveQuote,
  SolanaWalletPosition,
} from "@/types/solana";
import { fetchMeteoraDammPools, fetchMeteoraPoolsByIds } from "./meteoraApi";
import {
  applySlippageDown,
  applySlippageUp,
  poolShareAfterDeposit,
} from "./shared";

/**
 * Meteora DAMM v2 (`cp-amm`) adapter.
 *
 * DAMM v2 is constant-product with dynamic fees, so deposits are full-range and
 * need no price band — but unlike a classic AMM it still represents ownership
 * as an NFT position rather than a fungible LP token. That means a wallet can
 * hold several positions in one pool, and the first deposit has to create the
 * position account.
 */

function toBN(value: bigint): BN {
  return new BN(value.toString());
}

function toBigInt(value: BN): bigint {
  return BigInt(value.toString());
}

function getCpAmm(ctx: ReadContext | AdapterContext): CpAmm {
  return new CpAmm(ctx.connection);
}

/** Threshold amounts a withdrawal will accept, after slippage. */
function threshold(amount: bigint, slippagePercent: number): BN {
  return toBN(applySlippageDown(amount, slippagePercent));
}

export const meteoraDammAdapter: LiquidityAdapter = {
  id: "meteora-damm",

  async findPools(
    _ctx: ReadContext,
    params: FindPoolsParams,
  ): Promise<SolanaPoolSummary[]> {
    return fetchMeteoraDammPools(params.mint, params.quoteMint);
  },

  async loadPool(
    ctx: ReadContext,
    summary: SolanaPoolSummary,
  ): Promise<SolanaPoolDetail> {
    const cpAmm = getCpAmm(ctx);
    const poolKey = new PublicKey(summary.id);
    const state = await cpAmm.fetchPoolState(poolKey);

    const positions: SolanaPosition[] = [];
    if (ctx.owner) {
      const owned = await cpAmm.getUserPositionByPool(poolKey, ctx.owner);

      for (const entry of owned) {
        const liquidity = entry.positionState.unlockedLiquidity;
        const withdraw = cpAmm.getWithdrawQuote({
          liquidityDelta: liquidity,
          minSqrtPrice: state.sqrtMinPrice,
          maxSqrtPrice: state.sqrtMaxPrice,
          sqrtPrice: state.sqrtPrice,
          collectFeeMode: state.collectFeeMode,
        } as Parameters<typeof cpAmm.getWithdrawQuote>[0]);

        positions.push({
          id: entry.position.toBase58(),
          liquidity: toBigInt(liquidity),
          amountA: toBigInt(withdraw.outAmountA),
          amountB: toBigInt(withdraw.outAmountB),
          poolShare: poolShareAfterDeposit(
            toBigInt(liquidity),
            toBigInt(state.liquidity) - toBigInt(liquidity),
          ),
          feesA: toBigInt(entry.positionState.feeAPending),
          feesB: toBigInt(entry.positionState.feeBPending),
        });
      }
    }

    return {
      ...summary,
      reserveA: 0n,
      reserveB: 0n,
      price: summary.price,
      lpSupply: toBigInt(state.liquidity),
      positions,
    };
  },

  async findOwnerPositions(ctx: OwnerContext): Promise<SolanaWalletPosition[]> {
    const cpAmm = getCpAmm(ctx);

    const owned = await cpAmm.getPositionsByUser(ctx.owner);
    const live = owned.filter(
      (entry) => !entry.positionState.unlockedLiquidity.isZero(),
    );
    if (live.length === 0) return [];

    const poolIds = [
      ...new Set(live.map((entry) => entry.positionState.pool.toBase58())),
    ];
    const [summaries, states] = await Promise.all([
      fetchMeteoraPoolsByIds("meteora-damm", poolIds),
      // Withdrawable amounts depend on the pool's current price, so each pool
      // the wallet has a position in is read once and shared across them.
      Promise.all(
        poolIds.map(async (id) => {
          try {
            return [id, await cpAmm.fetchPoolState(new PublicKey(id))] as const;
          } catch {
            return [id, undefined] as const;
          }
        }),
      ),
    ]);
    const stateById = new Map(states);

    const positions: SolanaWalletPosition[] = [];
    for (const entry of live) {
      const poolId = entry.positionState.pool.toBase58();
      const pool = summaries.get(poolId);
      const state = stateById.get(poolId);
      if (!pool || !state) continue;

      const liquidity = entry.positionState.unlockedLiquidity;
      const withdraw = cpAmm.getWithdrawQuote({
        liquidityDelta: liquidity,
        minSqrtPrice: state.sqrtMinPrice,
        maxSqrtPrice: state.sqrtMaxPrice,
        sqrtPrice: state.sqrtPrice,
        collectFeeMode: state.collectFeeMode,
      } as Parameters<typeof cpAmm.getWithdrawQuote>[0]);

      positions.push({
        pool,
        position: {
          id: entry.position.toBase58(),
          liquidity: toBigInt(liquidity),
          amountA: toBigInt(withdraw.outAmountA),
          amountB: toBigInt(withdraw.outAmountB),
          poolShare: poolShareAfterDeposit(
            toBigInt(liquidity),
            toBigInt(state.liquidity) - toBigInt(liquidity),
          ),
          feesA: toBigInt(entry.positionState.feeAPending),
          feesB: toBigInt(entry.positionState.feeBPending),
        },
      });
    }

    return positions;
  },

  async quoteAdd(
    ctx: ReadContext,
    params: QuoteAddParams,
  ): Promise<SolanaAddQuote> {
    const { pool, inputAmount, inputSide, slippagePercent } = params;
    const cpAmm = getCpAmm(ctx);
    const state = await cpAmm.fetchPoolState(new PublicKey(pool.id));

    const quote = cpAmm.getDepositQuote({
      inAmount: toBN(inputAmount),
      isTokenA: inputSide === "A",
      minSqrtPrice: state.sqrtMinPrice,
      maxSqrtPrice: state.sqrtMaxPrice,
      sqrtPrice: state.sqrtPrice,
      collectFeeMode: state.collectFeeMode,
    } as Parameters<typeof cpAmm.getDepositQuote>[0]);

    const amountA =
      inputSide === "A"
        ? toBigInt(quote.consumedInputAmount)
        : toBigInt(quote.outputAmount);
    const amountB =
      inputSide === "B"
        ? toBigInt(quote.consumedInputAmount)
        : toBigInt(quote.outputAmount);

    return {
      amountA,
      amountB,
      maxAmountA: applySlippageUp(amountA, slippagePercent),
      maxAmountB: applySlippageUp(amountB, slippagePercent),
      liquidity: toBigInt(quote.liquidityDelta),
      poolShare: poolShareAfterDeposit(
        toBigInt(quote.liquidityDelta),
        pool.lpSupply ?? 0n,
      ),
      isInitialLiquidity: false,
    };
  },

  async quoteRemove(
    ctx: ReadContext,
    params: RemoveParams,
  ): Promise<SolanaRemoveQuote> {
    const { pool, position, fraction, slippagePercent } = params;
    const cpAmm = getCpAmm(ctx);
    const state = await cpAmm.fetchPoolState(new PublicKey(pool.id));

    const liquidity =
      (position.liquidity * BigInt(Math.round(fraction * 10_000))) / 10_000n;

    const quote = cpAmm.getWithdrawQuote({
      liquidityDelta: toBN(liquidity),
      minSqrtPrice: state.sqrtMinPrice,
      maxSqrtPrice: state.sqrtMaxPrice,
      sqrtPrice: state.sqrtPrice,
      collectFeeMode: state.collectFeeMode,
    } as Parameters<typeof cpAmm.getWithdrawQuote>[0]);

    const amountA = toBigInt(quote.outAmountA);
    const amountB = toBigInt(quote.outAmountB);

    return {
      liquidity,
      amountA,
      amountB,
      minAmountA: applySlippageDown(amountA, slippagePercent),
      minAmountB: applySlippageDown(amountB, slippagePercent),
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
    const cpAmm = getCpAmm(ctx);
    const poolKey = new PublicKey(pool.id);
    const state = await cpAmm.fetchPoolState(poolKey);

    const programs = await tokenPrograms(ctx, state);

    // Depositing into a position the wallet already holds.
    if (positionId) {
      const owned = await cpAmm.getUserPositionByPool(
        poolKey,
        ctx.wallet.publicKey,
      );
      const entry = owned.find((p) => p.position.toBase58() === positionId);
      if (!entry) throw new Error("That position no longer exists on-chain.");

      const transaction = await cpAmm.addLiquidity({
        owner: ctx.wallet.publicKey,
        pool: poolKey,
        position: entry.position,
        positionNftAccount: entry.positionNftAccount,
        liquidityDelta: toBN(quote.liquidity),
        maxAmountTokenA: toBN(quote.maxAmountA),
        maxAmountTokenB: toBN(quote.maxAmountB),
        tokenAAmountThreshold: threshold(quote.amountA, slippagePercent),
        tokenBAmountThreshold: threshold(quote.amountB, slippagePercent),
        tokenAMint: state.tokenAMint,
        tokenBMint: state.tokenBMint,
        tokenAVault: state.tokenAVault,
        tokenBVault: state.tokenBVault,
        tokenAProgram: programs.a,
        tokenBProgram: programs.b,
      });

      return { transactions: [transaction], labels: ["Add liquidity"] };
    }

    // A new position needs its own NFT mint, generated client-side.
    const positionNft = Keypair.generate();
    const transaction = await cpAmm.createPositionAndAddLiquidity({
      owner: ctx.wallet.publicKey,
      pool: poolKey,
      positionNft: positionNft.publicKey,
      liquidityDelta: toBN(quote.liquidity),
      maxAmountTokenA: toBN(quote.maxAmountA),
      maxAmountTokenB: toBN(quote.maxAmountB),
      tokenAAmountThreshold: threshold(quote.amountA, slippagePercent),
      tokenBAmountThreshold: threshold(quote.amountB, slippagePercent),
      tokenAMint: state.tokenAMint,
      tokenBMint: state.tokenBMint,
      tokenAProgram: programs.a,
      tokenBProgram: programs.b,
    });

    return {
      transactions: [transaction],
      labels: ["Open position and deposit"],
      extraSigners: [[positionNft]],
    };
  },

  async buildRemove(
    ctx: AdapterContext,
    params: RemoveParams,
  ): Promise<BuiltTransactions> {
    const { pool, position, fraction, slippagePercent } = params;
    const cpAmm = getCpAmm(ctx);
    const poolKey = new PublicKey(pool.id);
    const state = await cpAmm.fetchPoolState(poolKey);
    const programs = await tokenPrograms(ctx, state);

    const positionKey = new PublicKey(position.id);
    const positionNftAccount = derivePositionNftAccount(positionKey);

    const liquidity =
      (position.liquidity * BigInt(Math.round(fraction * 10_000))) / 10_000n;

    const transaction = await cpAmm.removeLiquidity({
      owner: ctx.wallet.publicKey,
      pool: poolKey,
      position: positionKey,
      positionNftAccount,
      liquidityDelta: toBN(liquidity),
      tokenAAmountThreshold: threshold(
        (position.amountA * BigInt(Math.round(fraction * 10_000))) / 10_000n,
        slippagePercent,
      ),
      tokenBAmountThreshold: threshold(
        (position.amountB * BigInt(Math.round(fraction * 10_000))) / 10_000n,
        slippagePercent,
      ),
      tokenAMint: state.tokenAMint,
      tokenBMint: state.tokenBMint,
      tokenAVault: state.tokenAVault,
      tokenBVault: state.tokenBVault,
      tokenAProgram: programs.a,
      tokenBProgram: programs.b,
      vestings: [],
      currentPoint: new BN(0),
    } as Parameters<typeof cpAmm.removeLiquidity>[0]);

    return { transactions: [transaction], labels: ["Remove liquidity"] };
  },

  async buildCreatePool(): Promise<BuiltTransactions> {
    // Creating a DAMM v2 pool requires a protocol config account chosen from
    // Meteora's allowlist, which the public API does not expose. Surfacing a
    // clear message beats building a transaction that is certain to fail.
    throw new Error(
      "Creating a new DAMM v2 pool isn't supported here yet — Meteora gates pool creation behind an allowlisted config account. Use Meteora's own UI to create the pool, then come back to add liquidity. Raydium CPMM, Raydium CLMM, Orca and Meteora DLMM all support creation.",
    );
  },
};

/** Resolve which token program owns each side of the pair. */
async function tokenPrograms(
  ctx: ReadContext | AdapterContext,
  state: PoolState,
): Promise<{ a: PublicKey; b: PublicKey }> {
  const [flagA, flagB] = [state.tokenAFlag, state.tokenBFlag];
  return {
    a: getTokenProgram(flagA),
    b: getTokenProgram(flagB),
  };
}
