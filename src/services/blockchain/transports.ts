import { fallback, http, type Transport } from "viem";
import { rpcUrl } from "./rpc";

/**
 * Per-chain transport construction.
 *
 * viem's bare `http()` uses a single default public endpoint per chain, which
 * is frequently rate-limited or CORS-blocked in the browser (surfacing as
 * "HTTP request failed"). To work reliably out of the box we build a
 * `fallback()` transport that tries, in order:
 *
 *   1. the user's own RPC (NEXT_PUBLIC_RPC_URL_<chainId>), when set;
 *   2. a small list of reliable, CORS-enabled public endpoints.
 *
 * `fallback` automatically rotates to the next endpoint on failure, so a single
 * flaky provider no longer breaks token analysis.
 */

/** Reliable, browser/CORS-friendly public RPCs per chain (ordered by preference). */
const PUBLIC_RPCS: Record<number, string[]> = {
  1: [
    "https://ethereum-rpc.publicnode.com",
    "https://eth.llamarpc.com",
    "https://rpc.ankr.com/eth",
    "https://cloudflare-eth.com",
  ],
  8453: [
    "https://base-rpc.publicnode.com",
    "https://mainnet.base.org",
    "https://base.llamarpc.com",
  ],
  42161: [
    "https://arbitrum-one-rpc.publicnode.com",
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum.llamarpc.com",
  ],
  10: [
    "https://optimism-rpc.publicnode.com",
    "https://mainnet.optimism.io",
    "https://optimism.llamarpc.com",
  ],
  137: [
    "https://polygon-bor-rpc.publicnode.com",
    "https://polygon-rpc.com",
    "https://polygon.llamarpc.com",
  ],
  56: [
    "https://bsc-rpc.publicnode.com",
    "https://bsc-dataseed.binance.org",
    "https://binance.llamarpc.com",
  ],
};

/** Build a resilient transport for a chain (env override first, then fallbacks). */
export function buildTransport(chainId: number): Transport {
  const override = rpcUrl(chainId);
  const publics = PUBLIC_RPCS[chainId] ?? [];
  const urls = [override, ...publics].filter(
    (u): u is string => Boolean(u),
  );

  // No known URLs → let viem use the chain's built-in default.
  if (urls.length === 0) return http();

  return fallback(
    urls.map((url) => http(url, { timeout: 10_000 })),
    { rank: false },
  );
}
