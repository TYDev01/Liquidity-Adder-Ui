import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import BN from "bn.js";
import DLMM, {
  StrategyType,
  autoFillXByStrategy,
  autoFillYByStrategy,
  computeBaseFactorFromFeeBps,
  deriveLbPair2,
  derivePresetParameter2,
  type LbPosition,
} from "@meteora-ag/dlmm";
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
import { SOLANA_PLATFORMS } from "@/constants/solana";
import { fetchMeteoraDlmmPools, fetchMeteoraPoolsByIds } from "./meteoraApi";
import { applySlippageDown, applySlippageUp } from "./shared";

/**
 * Meteora DLMM adapter.
 *
 * DLMM is a *bin* AMM: liquidity sits in discrete price buckets rather than on
 * a continuous curve. Two consequences shape this adapter:
 *
 *   1. A deposit needs a bin range plus a distribution strategy. We use `Spot`
 *      (uniform across the range), which is the neutral choice — `Curve` and
 *      `BidAsk` are directional bets the UI doesn't ask the user to make.
 *   2. The two sides of a deposit are not free parameters. Once a range is
 *      fixed, the amount of Y implied by a given X is determined by where the
 *      active bin sits, so the counterpart amount is computed by the SDK's
 *      `autoFill*` helpers rather than by a constant-product ratio.
 */

const PROGRAM_ID = new PublicKey(SOLANA_PLATFORMS["meteora-dlmm"].programId);

/** Bins per position are capped; a wider band needs several positions. */
const MAX_BINS_PER_POSITION = 69;

function toBN(value: bigint): BN {
  return new BN(value.toString());
}

function toBigInt(value: BN | string): bigint {
  return BigInt(typeof value === "string" ? value : value.toString());
}

/** Load the on-chain pool state for a summary. */
async function loadDlmm(
  ctx: ReadContext,
  poolId: string,
): Promise<DLMM> {
  return DLMM.create(ctx.connection, new PublicKey(poolId), {
    programId: PROGRAM_ID,
  });
}

/** Convert an SDK position into our venue-neutral shape. */
function toPosition(
  dlmm: DLMM,
  position: LbPosition,
  decimalsA: number,
  decimalsB: number,
  activeBinId: number,
): SolanaPosition {
  const data = position.positionData;
  const lowerPrice = Number(
    dlmm.fromPricePerLamport(
      Number(getBinPrice(data.lowerBinId, dlmm.lbPair.binStep)),
    ),
  );
  const upperPrice = Number(
    dlmm.fromPricePerLamport(
      Number(getBinPrice(data.upperBinId, dlmm.lbPair.binStep)),
    ),
  );

  return {
    id: position.publicKey.toBase58(),
    // DLMM has no scalar "liquidity"; the position's token totals are the
    // meaningful measure, so the X side stands in for sizing maths.
    liquidity: toBigInt(data.totalXAmount),
    amountA: toBigInt(data.totalXAmount),
    amountB: toBigInt(data.totalYAmount),
    lowerPrice,
    upperPrice,
    lowerTick: data.lowerBinId,
    upperTick: data.upperBinId,
    inRange:
      activeBinId >= data.lowerBinId && activeBinId <= data.upperBinId,
    feesA: BigInt(data.feeX.toString()),
    feesB: BigInt(data.feeY.toString()),
  };
}

/** Price of a bin, in per-lamport terms. */
function getBinPrice(binId: number, binStep: number): string {
  return ((1 + binStep / 10_000) ** binId).toString();
}

/**
 * A bin's price in display terms (Y per X), without needing a `DLMM` instance.
 * Same conversion the SDK's `fromPricePerLamport` applies.
 */
function binPriceToUi(
  binId: number,
  binStep: number,
  decimalsA: number,
  decimalsB: number,
): number {
  return Number(getBinPrice(binId, binStep)) * 10 ** (decimalsA - decimalsB);
}

export const meteoraDlmmAdapter: LiquidityAdapter = {
  id: "meteora-dlmm",

  async findPools(
    _ctx: ReadContext,
    params: FindPoolsParams,
  ): Promise<SolanaPoolSummary[]> {
    return fetchMeteoraDlmmPools(params.mint, params.quoteMint);
  },

  async loadPool(
    ctx: ReadContext,
    summary: SolanaPoolSummary,
  ): Promise<SolanaPoolDetail> {
    const dlmm = await loadDlmm(ctx, summary.id);
    const activeBin = await dlmm.getActiveBin();

    const decimalsA = dlmm.tokenX.mint.decimals;
    const decimalsB = dlmm.tokenY.mint.decimals;

    let positions: SolanaPosition[] = [];
    if (ctx.owner) {
      const { userPositions } = await dlmm.getPositionsByUserAndLbPair(
        ctx.owner,
      );
      positions = userPositions.map((p) =>
        toPosition(dlmm, p, decimalsA, decimalsB, activeBin.binId),
      );
    }

    return {
      ...summary,
      decimalsA,
      decimalsB,
      reserveA: dlmm.tokenX.amount,
      reserveB: dlmm.tokenY.amount,
      currentTick: activeBin.binId,
      price: Number(activeBin.pricePerToken),
      positions,
    };
  },

  async findOwnerPositions(ctx: OwnerContext): Promise<SolanaWalletPosition[]> {
    // The SDK indexes positions by owner across every pair in one pass.
    const byPair = await DLMM.getAllLbPairPositionsByUser(
      ctx.connection,
      ctx.owner,
      { programId: PROGRAM_ID },
    );
    if (byPair.size === 0) return [];

    const summaries = await fetchMeteoraPoolsByIds("meteora-dlmm", [
      ...byPair.keys(),
    ]);

    const positions: SolanaWalletPosition[] = [];
    for (const [pairId, info] of byPair) {
      const pool = summaries.get(pairId);
      if (!pool) continue;

      const binStep = info.lbPair.binStep;
      const activeBinId = info.lbPair.activeId;

      for (const position of info.lbPairPositionsData) {
        const data = position.positionData;
        // Positions linger after a full withdrawal until the account is closed.
        if (data.totalXAmount === "0" && data.totalYAmount === "0") continue;

        positions.push({
          pool,
          position: {
            id: position.publicKey.toBase58(),
            liquidity: toBigInt(data.totalXAmount),
            amountA: toBigInt(data.totalXAmount),
            amountB: toBigInt(data.totalYAmount),
            lowerTick: data.lowerBinId,
            upperTick: data.upperBinId,
            lowerPrice: binPriceToUi(
              data.lowerBinId,
              binStep,
              pool.decimalsA,
              pool.decimalsB,
            ),
            upperPrice: binPriceToUi(
              data.upperBinId,
              binStep,
              pool.decimalsA,
              pool.decimalsB,
            ),
            inRange:
              activeBinId >= data.lowerBinId && activeBinId <= data.upperBinId,
            feesA: BigInt(data.feeX.toString()),
            feesB: BigInt(data.feeY.toString()),
          },
        });
      }
    }

    return positions;
  },

  async quoteAdd(
    ctx: ReadContext,
    params: QuoteAddParams,
  ): Promise<SolanaAddQuote> {
    const { pool, inputAmount, inputSide, slippagePercent } = params;
    const dlmm = await loadDlmm(ctx, pool.id);
    const activeBin = await dlmm.getActiveBin();

    const { minBinId, maxBinId } = resolveBinRange(
      dlmm,
      activeBin.binId,
      params.lowerPrice,
      params.upperPrice,
    );

    // Given one side, the SDK derives the other from the bin distribution.
    let amountA: bigint;
    let amountB: bigint;

    if (inputSide === "A") {
      amountA = inputAmount;
      amountB = BigInt(
        autoFillYByStrategy(
          activeBin.binId,
          dlmm.lbPair.binStep,
          toBN(inputAmount),
          activeBin.xAmount,
          activeBin.yAmount,
          minBinId,
          maxBinId,
          StrategyType.Spot,
        ).toString(),
      );
    } else {
      amountB = inputAmount;
      amountA = BigInt(
        autoFillXByStrategy(
          activeBin.binId,
          dlmm.lbPair.binStep,
          toBN(inputAmount),
          activeBin.xAmount,
          activeBin.yAmount,
          minBinId,
          maxBinId,
          StrategyType.Spot,
        ).toString(),
      );
    }

    const binCount = maxBinId - minBinId + 1;

    return {
      amountA,
      amountB,
      maxAmountA: applySlippageUp(amountA, slippagePercent),
      maxAmountB: applySlippageUp(amountB, slippagePercent),
      // Bin AMMs mint no LP token; size the position by its X-side deposit.
      liquidity: amountA,
      isInitialLiquidity: false,
      lowerTick: minBinId,
      upperTick: maxBinId,
      lowerPrice: Number(
        dlmm.fromPricePerLamport(
          Number(getBinPrice(minBinId, dlmm.lbPair.binStep)),
        ),
      ),
      upperPrice: Number(
        dlmm.fromPricePerLamport(
          Number(getBinPrice(maxBinId, dlmm.lbPair.binStep)),
        ),
      ),
      warning:
        binCount > MAX_BINS_PER_POSITION
          ? `This range spans ${binCount} bins; Meteora caps a single position at ${MAX_BINS_PER_POSITION}. Narrow the range.`
          : undefined,
    };
  },

  async quoteRemove(
    _ctx: ReadContext,
    params: RemoveParams,
  ): Promise<SolanaRemoveQuote> {
    const { position, fraction, slippagePercent } = params;
    const bps = BigInt(Math.round(fraction * 10_000));

    const amountA = (position.amountA * bps) / 10_000n;
    const amountB = (position.amountB * bps) / 10_000n;

    return {
      liquidity: (position.liquidity * bps) / 10_000n,
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
    const dlmm = await loadDlmm(
      { connection: ctx.connection, owner: ctx.wallet.publicKey },
      pool.id,
    );

    const strategy = {
      minBinId: quote.lowerTick!,
      maxBinId: quote.upperTick!,
      strategyType: StrategyType.Spot,
    };

    // Adding to an existing position reuses its key and needs no extra signer;
    // a new position mints a fresh account that must sign its own creation.
    if (positionId) {
      const transaction = await dlmm.addLiquidityByStrategy({
        positionPubKey: new PublicKey(positionId),
        user: ctx.wallet.publicKey,
        totalXAmount: toBN(quote.amountA),
        totalYAmount: toBN(quote.amountB),
        strategy,
        slippage: slippagePercent,
      });
      return {
        transactions: [transaction],
        labels: ["Add liquidity to position"],
      };
    }

    const position = Keypair.generate();
    const transaction = await dlmm.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: position.publicKey,
      user: ctx.wallet.publicKey,
      totalXAmount: toBN(quote.amountA),
      totalYAmount: toBN(quote.amountB),
      strategy,
      slippage: slippagePercent,
    });

    return {
      transactions: [transaction],
      labels: ["Open position and deposit"],
      extraSigners: [[position]],
    };
  },

  async buildRemove(
    ctx: AdapterContext,
    params: RemoveParams,
  ): Promise<BuiltTransactions> {
    const { pool, position, fraction } = params;
    const dlmm = await loadDlmm(
      { connection: ctx.connection, owner: ctx.wallet.publicKey },
      pool.id,
    );

    const result = await dlmm.removeLiquidity({
      user: ctx.wallet.publicKey,
      position: new PublicKey(position.id),
      fromBinId: position.lowerTick!,
      toBinId: position.upperTick!,
      bps: new BN(Math.round(fraction * 10_000)),
      // Withdrawing everything also claims fees and reclaims the account rent.
      shouldClaimAndClose: fraction >= 1,
    });

    const transactions = Array.isArray(result) ? result : [result];
    return {
      transactions,
      labels: transactions.map((_, i) =>
        transactions.length > 1
          ? `Withdraw liquidity (${i + 1}/${transactions.length})`
          : "Withdraw liquidity",
      ),
    };
  },

  async buildCreatePool(
    ctx: AdapterContext,
    params: CreatePoolParams,
  ): Promise<BuiltTransactions> {
    const { tokenA, tokenB, tierKey, amountA, amountB, slippagePercent } =
      params;

    const binStep = new BN(tierKey);
    // Meteora binds the fee to a base factor derived from the bin step. The
    // helper returns [baseFactor, baseFeePowerFactor]; only the first is used
    // for the preset-parameter PDA.
    const baseFactor = computeBaseFactorFromFeeBps(binStep, new BN(tierKey))[0];
    if (!baseFactor) {
      throw new Error(
        `No DLMM preset parameters exist for a bin step of ${tierKey}.`,
      );
    }
    const [presetParameter] = derivePresetParameter2(
      binStep,
      baseFactor,
      PROGRAM_ID,
    );

    // The opening price is set by the deposit ratio, expressed as a bin id.
    const openingPrice =
      Number(amountB) /
      10 ** tokenB.decimals /
      (Number(amountA) / 10 ** tokenA.decimals);

    const activeId = new BN(
      Math.round(
        Math.log(openingPrice * 10 ** (tokenB.decimals - tokenA.decimals)) /
          Math.log(1 + tierKey / 10_000),
      ),
    );

    const createTx = await DLMM.createLbPair2(
      ctx.connection,
      ctx.wallet.publicKey,
      new PublicKey(tokenA.mint),
      new PublicKey(tokenB.mint),
      presetParameter,
      activeId,
      { programId: PROGRAM_ID },
    );

    // The pool must exist before a position can be opened in it, so the
    // deposit is a second transaction sent after the first confirms.
    const [poolAddress] = deriveLbPair2(
      new PublicKey(tokenA.mint),
      new PublicKey(tokenB.mint),
      binStep,
      baseFactor,
      PROGRAM_ID,
    );

    const position = Keypair.generate();
    const depositTx = await buildInitialDeposit(
      ctx,
      poolAddress,
      position,
      amountA,
      amountB,
      activeId.toNumber(),
      tierKey,
      slippagePercent,
    );

    return {
      transactions: [createTx, depositTx],
      labels: ["Create DLMM pool", "Open position and deposit"],
      extraSigners: [[], [position]],
    };
  },
};

/** Build the first deposit into a pool that doesn't exist on chain yet. */
async function buildInitialDeposit(
  ctx: AdapterContext,
  poolAddress: PublicKey,
  position: Keypair,
  amountA: bigint,
  amountB: bigint,
  activeId: number,
  binStep: number,
  slippagePercent: number,
): Promise<Transaction> {
  const dlmm = await DLMM.create(ctx.connection, poolAddress, {
    programId: PROGRAM_ID,
  });

  // Centre a modest band on the opening price — wide enough to absorb early
  // volatility, narrow enough to stay inside the per-position bin cap.
  const halfWidth = Math.floor(MAX_BINS_PER_POSITION / 2);

  return dlmm.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: position.publicKey,
    user: ctx.wallet.publicKey,
    totalXAmount: toBN(amountA),
    totalYAmount: toBN(amountB),
    strategy: {
      minBinId: activeId - halfWidth,
      maxBinId: activeId + halfWidth,
      strategyType: StrategyType.Spot,
    },
    slippage: slippagePercent,
  });
}

/**
 * Turn a user-facing price band into bin ids, falling back to a band centred on
 * the active bin when the user chose full range.
 */
function resolveBinRange(
  dlmm: DLMM,
  activeBinId: number,
  lowerPrice: number | undefined,
  upperPrice: number | undefined,
): { minBinId: number; maxBinId: number } {
  const halfWidth = Math.floor(MAX_BINS_PER_POSITION / 2);

  if (
    lowerPrice === undefined ||
    upperPrice === undefined ||
    !Number.isFinite(lowerPrice) ||
    !Number.isFinite(upperPrice) ||
    lowerPrice <= 0
  ) {
    // "Full range" on a bin AMM means the widest single position allowed.
    return {
      minBinId: activeBinId - halfWidth,
      maxBinId: activeBinId + halfWidth,
    };
  }

  const minBinId = dlmm.getBinIdFromPrice(
    Number(dlmm.toPricePerLamport(lowerPrice)),
    true,
  );
  const maxBinId = dlmm.getBinIdFromPrice(
    Number(dlmm.toPricePerLamport(upperPrice)),
    false,
  );

  return {
    minBinId: Math.min(minBinId, maxBinId),
    maxBinId: Math.max(minBinId, maxBinId),
  };
}
