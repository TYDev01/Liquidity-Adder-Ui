import type { SolanaPoolSummary } from "@/types/solana";
import { SOLANA_PLATFORMS, type SolanaPlatformId } from "@/constants/solana";

/**
 * Raydium public API (v3) — used for pool *discovery* only.
 *
 * Enumerating pools by mint over raw RPC means `getProgramAccounts` with large
 * filters, which most endpoints rate-limit or refuse outright. The API is the
 * supported path for listing; every number it returns is treated as display
 * metadata, and live state for the pool the user picks is re-read from chain
 * through the SDK before any transaction is built.
 */

const API_BASE = SOLANA_PLATFORMS["raydium-cpmm"].apiBase!;

interface ApiMint {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  programId: string;
}

interface ApiPool {
  type: string;
  programId: string;
  id: string;
  mintA: ApiMint;
  mintB: ApiMint;
  price: number;
  mintAmountA: number;
  mintAmountB: number;
  feeRate: number;
  tvl: number;
  day?: { volume?: number; apr?: number };
  lpMint?: { address: string; decimals: number };
  config?: { id: string; index: number; tradeFeeRate: number; tickSpacing?: number };
}

interface ApiEnvelope<T> {
  id: string;
  success: boolean;
  data: T;
}

/** Which of our platform ids a returned pool belongs to, if any. */
function classify(pool: ApiPool): SolanaPlatformId | undefined {
  if (pool.programId === SOLANA_PLATFORMS["raydium-cpmm"].programId) {
    return "raydium-cpmm";
  }
  if (pool.programId === SOLANA_PLATFORMS["raydium-clmm"].programId) {
    return "raydium-clmm";
  }
  // AMM v4 (legacy OpenBook-backed) pools are listed by the same endpoint but
  // aren't a venue we deposit into — creating one needs an OpenBook market.
  return undefined;
}

function toSummary(pool: ApiPool, platform: SolanaPlatformId): SolanaPoolSummary {
  return {
    id: pool.id,
    platform,
    poolModel: SOLANA_PLATFORMS[platform].poolModel,
    mintA: pool.mintA.address,
    mintB: pool.mintB.address,
    symbolA: pool.mintA.symbol || pool.mintA.address.slice(0, 4),
    symbolB: pool.mintB.symbol || pool.mintB.address.slice(0, 4),
    decimalsA: pool.mintA.decimals,
    decimalsB: pool.mintB.decimals,
    // The API reports the fee as a rate scaled by 1e6 (2500 = 0.25%).
    feeBps: Math.round((pool.feeRate ?? 0) * 10_000) || Math.round((pool.config?.tradeFeeRate ?? 0) / 100),
    tierKey: pool.config?.tickSpacing ?? pool.config?.index,
    tvlUsd: pool.tvl,
    volume24hUsd: pool.day?.volume,
    apr: pool.day?.apr,
    price: pool.price,
  };
}

/**
 * List Raydium pools holding both mints, newest-liquidity first. Returns pools
 * for both CPMM and CLMM; the caller filters to the selected platform.
 */
export async function fetchRaydiumPools(
  mint1: string,
  mint2: string,
): Promise<SolanaPoolSummary[]> {
  const params = new URLSearchParams({
    mint1,
    mint2,
    poolType: "all",
    poolSortField: "liquidity",
    sortType: "desc",
    pageSize: "50",
    page: "1",
  });

  const res = await fetch(`${API_BASE}/pools/info/mint?${params}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Raydium API returned ${res.status} while listing pools.`);
  }

  const body = (await res.json()) as ApiEnvelope<{ data: ApiPool[] }>;
  if (!body.success || !body.data?.data) return [];

  const summaries: SolanaPoolSummary[] = [];
  for (const pool of body.data.data) {
    const platform = classify(pool);
    if (platform) summaries.push(toSummary(pool, platform));
  }
  return summaries;
}

/** Fetch a single pool's API record by id. */
export async function fetchRaydiumPoolById(
  id: string,
): Promise<SolanaPoolSummary | undefined> {
  const res = await fetch(`${API_BASE}/pools/info/ids?ids=${id}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) return undefined;
  const body = (await res.json()) as ApiEnvelope<(ApiPool | null)[]>;
  const pool = body.data?.[0];
  if (!pool) return undefined;
  const platform = classify(pool);
  return platform ? toSummary(pool, platform) : undefined;
}
