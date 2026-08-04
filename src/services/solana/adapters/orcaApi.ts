import type { SolanaPoolSummary } from "@/types/solana";
import { SOLANA_PLATFORMS } from "@/constants/solana";

/**
 * Orca API — Whirlpool discovery.
 *
 * As with Raydium, listing is done over the public API and execution over the
 * SDK against freshly-read on-chain state.
 */

const API_BASE = SOLANA_PLATFORMS["orca-whirlpool"].apiBase!;

interface OrcaToken {
  address: string;
  symbol?: string;
  name?: string;
  decimals: number;
  imageUrl?: string;
}

interface OrcaPool {
  address: string;
  tokenA: OrcaToken;
  tokenB: OrcaToken;
  tickSpacing: number;
  /** Fee rate in hundredths of a bip (500 = 0.05%). */
  feeRate: number;
  price?: string | number;
  tvlUsdc?: string | number;
  /** Rolling-window statistics, keyed by window ("24h", "7d", "30d"). */
  stats?: Record<string, { volume?: string | number; fees?: string | number } | undefined>;
  /** Fee yield over the last 24h, as a fraction of TVL. */
  yieldOverTvl?: string | number;
}

function num(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toSummary(pool: OrcaPool): SolanaPoolSummary {
  // `yieldOverTvl` is the fee yield over the trailing 24h, as a fraction of
  // TVL. Annualise it so the figure is comparable to the other venues' APRs.
  const dailyYield = num(pool.yieldOverTvl);

  return {
    id: pool.address,
    platform: "orca-whirlpool",
    poolModel: "concentrated",
    mintA: pool.tokenA.address,
    mintB: pool.tokenB.address,
    symbolA: pool.tokenA.symbol || pool.tokenA.address.slice(0, 4),
    symbolB: pool.tokenB.symbol || pool.tokenB.address.slice(0, 4),
    decimalsA: pool.tokenA.decimals,
    decimalsB: pool.tokenB.decimals,
    // Orca reports fee rate in hundredths of a bip.
    feeBps: Math.round(pool.feeRate / 100),
    tierKey: pool.tickSpacing,
    tvlUsd: num(pool.tvlUsdc),
    volume24hUsd: num(pool.stats?.["24h"]?.volume),
    apr: dailyYield !== undefined ? dailyYield * 365 * 100 : undefined,
    price: num(pool.price) ?? 0,
  };
}

/**
 * Fetch Whirlpools by address, keyed by address.
 *
 * The list endpoint's `address` filter is ignored when given several values, so
 * these go one request per pool. Position discovery turns up a handful at most.
 */
export async function fetchOrcaPoolsByIds(
  ids: string[],
): Promise<Map<string, SolanaPoolSummary>> {
  const found = new Map<string, SolanaPoolSummary>();

  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const res = await fetch(`${API_BASE}/v2/solana/pools/${id}`, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Orca API returned ${res.status}.`);
      const body = (await res.json()) as { data?: OrcaPool };
      return body.data;
    }),
  );

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const pool = result.value;
    if (pool?.tokenA && pool.tokenB) found.set(pool.address, toSummary(pool));
  }

  return found;
}

/** List Whirlpools containing both mints. */
export async function fetchOrcaPools(
  mint1: string,
  mint2: string,
): Promise<SolanaPoolSummary[]> {
  const params = new URLSearchParams({
    tokensBothOf: `${mint1},${mint2}`,
    sortBy: "tvl",
    sortDirection: "desc",
    limit: "50",
  });

  const res = await fetch(`${API_BASE}/v2/solana/pools?${params}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Orca API returned ${res.status} while listing pools.`);
  }

  const body = (await res.json()) as { data?: OrcaPool[] };
  if (!Array.isArray(body.data)) return [];
  return body.data
    .filter((p) => p.tokenA && p.tokenB)
    .map(toSummary);
}
