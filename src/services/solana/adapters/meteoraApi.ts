import type { SolanaPoolSummary } from "@/types/solana";

/**
 * Meteora "datapi" — DLMM (bin) and DAMM v2 (constant-product) discovery.
 *
 * Both products are served by the same paginated API shape from separate hosts,
 * so one mapper covers them. Neither endpoint filters by mint directly: `query`
 * is a fuzzy match over name/tokens/address, so results are narrowed to the
 * exact pair client-side.
 */

const DLMM_API = "https://dlmm.datapi.meteora.ag";
const DAMM_API = "https://damm-v2.datapi.meteora.ag";

/** A token as embedded in a pool record — decimals included, so no RPC read. */
interface DatapiToken {
  address: string;
  name?: string;
  symbol?: string;
  decimals: number;
}

/** Rolling-window metrics, keyed by window ("24h", "12h", …). */
type WindowMetrics = Record<string, number | undefined>;

interface DatapiPool {
  address: string;
  name?: string;
  token_x: DatapiToken;
  token_y: DatapiToken;
  pool_config?: {
    /** DLMM only. */
    bin_step?: number;
    /** Base swap fee as a percentage (0.2 = 0.20%). */
    base_fee_pct?: number;
  };
  tvl?: number;
  current_price?: number;
  /** Fee yield over 24h, as a percentage. */
  apr?: number | null;
  /** Annualised, compounded percentage. */
  apy?: number | null;
  volume?: WindowMetrics;
}

interface DatapiResponse {
  total: number;
  pages: number;
  current_page: number;
  page_size: number;
  data: DatapiPool[];
}

function num(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toSummary(
  pool: DatapiPool,
  platform: "meteora-dlmm" | "meteora-damm",
): SolanaPoolSummary {
  const binStep = pool.pool_config?.bin_step;

  return {
    id: pool.address,
    platform,
    poolModel: platform === "meteora-dlmm" ? "bins" : "constant-product",
    mintA: pool.token_x.address,
    mintB: pool.token_y.address,
    symbolA: pool.token_x.symbol || pool.token_x.address.slice(0, 4),
    symbolB: pool.token_y.symbol || pool.token_y.address.slice(0, 4),
    decimalsA: pool.token_x.decimals,
    decimalsB: pool.token_y.decimals,
    // `base_fee_pct` is a percentage; basis points are percent × 100.
    feeBps: Math.round((pool.pool_config?.base_fee_pct ?? 0) * 100),
    tierKey: binStep,
    tvlUsd: num(pool.tvl),
    volume24hUsd: num(pool.volume?.["24h"]),
    // `apr` is the trailing-24h yield; `apy` is already annualised, so prefer
    // it for a figure comparable to the other venues.
    apr: num(pool.apy),
    price: num(pool.current_price) ?? 0,
  };
}

/** Keep only pools whose two mints are exactly the requested pair. */
function matchesPair(pool: DatapiPool, mint1: string, mint2: string): boolean {
  const x = pool.token_x?.address;
  const y = pool.token_y?.address;
  return (x === mint1 && y === mint2) || (x === mint2 && y === mint1);
}

async function fetchPools(
  base: string,
  mint1: string,
  mint2: string,
  platform: "meteora-dlmm" | "meteora-damm",
): Promise<SolanaPoolSummary[]> {
  const params = new URLSearchParams({
    query: mint1,
    page_size: "100",
    sort_by: "tvl:desc",
  });

  const res = await fetch(`${base}/pools?${params}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `Meteora API returned ${res.status} while listing pools.`,
    );
  }

  const body = (await res.json()) as DatapiResponse;
  if (!Array.isArray(body.data)) return [];

  return body.data
    .filter((pool) => pool.token_x && pool.token_y)
    .filter((pool) => matchesPair(pool, mint1, mint2))
    .map((pool) => toSummary(pool, platform));
}

/** List DLMM pairs holding both mints. */
export function fetchMeteoraDlmmPools(
  mint1: string,
  mint2: string,
): Promise<SolanaPoolSummary[]> {
  return fetchPools(DLMM_API, mint1, mint2, "meteora-dlmm");
}

/** List DAMM v2 pools holding both mints. */
export async function fetchMeteoraDammPools(
  mint1: string,
  mint2: string,
): Promise<SolanaPoolSummary[]> {
  try {
    return await fetchPools(DAMM_API, mint1, mint2, "meteora-damm");
  } catch {
    // DAMM v2 is the newest venue; treat an API blip as "no pools" rather than
    // failing the whole discovery pass.
    return [];
  }
}
