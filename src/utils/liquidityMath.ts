/**
 * Pure Uniswap V2 liquidity math. Kept framework-agnostic and side-effect free
 * so it is trivially unit-testable and reusable across DEX forks.
 */

const MINIMUM_LIQUIDITY = 1000n;

/** sqrt for bigint (Newton's method). */
export function bigintSqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("sqrt of negative");
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
}

/** Given amountA and reserves, the matching amountB (Uniswap `quote`). */
export function quote(
  amountA: bigint,
  reserveA: bigint,
  reserveB: bigint,
): bigint {
  if (amountA <= 0n) return 0n;
  if (reserveA <= 0n || reserveB <= 0n) return 0n;
  return (amountA * reserveB) / reserveA;
}

/** Apply a slippage tolerance (percent) as a floor: amount * (1 - slippage). */
export function applySlippage(amount: bigint, slippagePercent: number): bigint {
  const bps = BigInt(Math.round(slippagePercent * 100)); // percent -> bps
  return (amount * (10_000n - bps)) / 10_000n;
}

/**
 * LP tokens minted for an add-liquidity, matching the pair contract's logic.
 * For an empty pool this is sqrt(amountA*amountB) - MINIMUM_LIQUIDITY.
 */
export function computeLiquidityMinted(
  amountToken: bigint,
  amountEth: bigint,
  reserveToken: bigint,
  reserveEth: bigint,
  totalSupply: bigint,
): bigint {
  if (totalSupply === 0n) {
    const minted = bigintSqrt(amountToken * amountEth);
    return minted > MINIMUM_LIQUIDITY ? minted - MINIMUM_LIQUIDITY : 0n;
  }
  if (reserveToken === 0n || reserveEth === 0n) return 0n;
  const fromToken = (amountToken * totalSupply) / reserveToken;
  const fromEth = (amountEth * totalSupply) / reserveEth;
  return fromToken < fromEth ? fromToken : fromEth;
}

/** Pool share (0..1) that `liquidity` represents against `totalSupply`. */
export function poolShare(liquidity: bigint, totalSupply: bigint): number {
  const denom = totalSupply + liquidity;
  if (denom === 0n) return 0;
  // Scale by 1e6 for precision, then back to a float.
  return Number((liquidity * 1_000_000n) / denom) / 1_000_000;
}

/** Amounts returned when burning `liquidity` LP tokens. */
export function computeRemoveAmounts(
  liquidity: bigint,
  reserveToken: bigint,
  reserveEth: bigint,
  totalSupply: bigint,
): { amountToken: bigint; amountEth: bigint } {
  if (totalSupply === 0n) return { amountToken: 0n, amountEth: 0n };
  return {
    amountToken: (liquidity * reserveToken) / totalSupply,
    amountEth: (liquidity * reserveEth) / totalSupply,
  };
}

/**
 * Price impact (0..1) of adding `amountToken`/`amountEth` relative to the
 * current pool ratio. Zero for a perfectly proportional add.
 */
export function priceImpact(
  amountToken: bigint,
  amountEth: bigint,
  reserveToken: bigint,
  reserveEth: bigint,
): number {
  if (reserveToken === 0n || reserveEth === 0n) return 0;
  const poolPrice = Number(reserveEth) / Number(reserveToken);
  const addPrice =
    amountToken === 0n ? poolPrice : Number(amountEth) / Number(amountToken);
  if (poolPrice === 0) return 0;
  return Math.abs(addPrice - poolPrice) / poolPrice;
}
