import type {
  Address,
  ContractFunctionParameters,
  PublicClient,
} from "viem";
import { uniswapV2FactoryAbi } from "@/abis/uniswapV2Factory";
import { uniswapV2PairAbi } from "@/abis/uniswapV2Pair";
import { getChainConfig } from "@/constants/dex";
import type { PoolInfo, AddLiquidityQuote, RemoveLiquidityQuote } from "@/types";
import { addressesEqual, ZERO_ADDRESS } from "@/utils/validation";
import {
  applySlippage,
  computeLiquidityMinted,
  computeRemoveAmounts,
  poolShare,
  quote,
} from "@/utils/liquidityMath";

/**
 * Uniswap V2 (and forks) integration layer.
 *
 * All chain/DEX-specific addresses are resolved from the configuration layer,
 * so this service works unchanged across every configured chain and V2 fork.
 */

/** Resolve the pair address for token/WETH; ZERO_ADDRESS when no pool exists. */
export async function getPairAddress(
  client: PublicClient,
  chainId: number,
  token: Address,
): Promise<Address> {
  const { dex, weth } = getChainConfig(chainId);
  const pair = await client.readContract({
    address: dex.factory,
    abi: uniswapV2FactoryAbi,
    functionName: "getPair",
    args: [token, weth],
  });
  return pair as Address;
}

/** Full pool state, oriented so reserves map to (token, WETH). */
export async function getPoolInfo(
  client: PublicClient,
  chainId: number,
  token: Address,
  account?: Address,
): Promise<PoolInfo> {
  const { weth } = getChainConfig(chainId);
  const pairAddress = await getPairAddress(client, chainId, token);

  if (addressesEqual(pairAddress, ZERO_ADDRESS)) {
    return emptyPool(pairAddress);
  }

  // Heterogeneous + conditional call list; type loosely and read by index.
  const pair = { address: pairAddress, abi: uniswapV2PairAbi } as const;
  const contracts = [
    { ...pair, functionName: "getReserves" },
    { ...pair, functionName: "token0" },
    { ...pair, functionName: "totalSupply" },
    ...(account ? [{ ...pair, functionName: "balanceOf", args: [account] }] : []),
  ] as ContractFunctionParameters[];
  const results = await client.multicall({ allowFailure: false, contracts });

  const [reserve0, reserve1] = results[0] as readonly [bigint, bigint, number];
  const token0 = results[1] as Address;
  const totalSupply = results[2] as bigint;
  const lpBalance = account ? (results[3] as bigint) : undefined;

  // Orient reserves to (token, weth) regardless of token0/token1 ordering.
  const tokenIs0 = addressesEqual(token0, token);
  const reserveToken = tokenIs0 ? reserve0 : reserve1;
  const reserveWeth = tokenIs0 ? reserve1 : reserve0;

  const priceInEth =
    reserveToken > 0n ? Number(reserveWeth) / Number(reserveToken) : 0;
  const priceInToken = priceInEth > 0 ? 1 / priceInEth : 0;

  return {
    pairAddress,
    exists: true,
    token0,
    token1: tokenIs0 ? weth : token,
    reserveToken,
    reserveWeth,
    totalSupply,
    lpBalance,
    priceInEth,
    priceInToken,
  };
}

function emptyPool(pairAddress: Address): PoolInfo {
  return {
    pairAddress,
    exists: false,
    token0: ZERO_ADDRESS,
    token1: ZERO_ADDRESS,
    reserveToken: 0n,
    reserveWeth: 0n,
    totalSupply: 0n,
    lpBalance: undefined,
    priceInEth: 0,
    priceInToken: 0,
  };
}

/**
 * Build an add-liquidity quote. When a pool exists, `amountEthDesired` is
 * derived from `amountTokenDesired` at the current ratio (the canonical Uniswap
 * behaviour); for an empty pool both sides define the initial price.
 */
export function quoteAddLiquidity(params: {
  pool: PoolInfo;
  amountTokenDesired: bigint;
  amountEthDesired: bigint;
  slippagePercent: number;
}): AddLiquidityQuote {
  const { pool, amountTokenDesired, slippagePercent } = params;
  let amountEthDesired = params.amountEthDesired;

  const isInitialLiquidity = !pool.exists || pool.totalSupply === 0n;

  if (!isInitialLiquidity) {
    // Keep the pair ratio: ETH is a function of token amount.
    amountEthDesired = quote(
      amountTokenDesired,
      pool.reserveToken,
      pool.reserveWeth,
    );
  }

  const liquidity = computeLiquidityMinted(
    amountTokenDesired,
    amountEthDesired,
    pool.reserveToken,
    pool.reserveWeth,
    pool.totalSupply,
  );

  return {
    amountTokenDesired,
    amountEthDesired,
    amountTokenMin: applySlippage(amountTokenDesired, slippagePercent),
    amountEthMin: applySlippage(amountEthDesired, slippagePercent),
    liquidity,
    poolShare: isInitialLiquidity
      ? 1
      : poolShare(liquidity, pool.totalSupply),
    isInitialLiquidity,
  };
}

/** Build a remove-liquidity quote for burning `liquidity` LP tokens. */
export function quoteRemoveLiquidity(params: {
  pool: PoolInfo;
  liquidity: bigint;
  slippagePercent: number;
}): RemoveLiquidityQuote {
  const { pool, liquidity, slippagePercent } = params;
  const { amountToken, amountEth } = computeRemoveAmounts(
    liquidity,
    pool.reserveToken,
    pool.reserveWeth,
    pool.totalSupply,
  );
  return {
    liquidity,
    amountToken,
    amountEth,
    amountTokenMin: applySlippage(amountToken, slippagePercent),
    amountEthMin: applySlippage(amountEth, slippagePercent),
  };
}

/** Rough TVL estimate in native (ETH) terms: 2 × the WETH reserve. */
export function estimateTvlEth(pool: PoolInfo): number {
  return (Number(pool.reserveWeth) / 1e18) * 2;
}

/** Deadline as a unix timestamp `minutes` from now. */
export function deadlineFromNow(minutes: number): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + Math.floor(minutes * 60));
}
