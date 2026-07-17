/**
 * Static map of per-chain RPC overrides.
 *
 * Next.js only inlines `NEXT_PUBLIC_*` vars that are referenced *statically*
 * (i.e. `process.env.NEXT_PUBLIC_FOO`, not a computed key). We therefore list
 * each supported chain explicitly so overrides actually reach the browser
 * bundle. `undefined` values fall back to viem's public RPC for the chain.
 */
export const RPC_URLS: Record<number, string | undefined> = {
  1: process.env.NEXT_PUBLIC_RPC_URL_1,
  8453: process.env.NEXT_PUBLIC_RPC_URL_8453,
  42161: process.env.NEXT_PUBLIC_RPC_URL_42161,
  10: process.env.NEXT_PUBLIC_RPC_URL_10,
  137: process.env.NEXT_PUBLIC_RPC_URL_137,
  56: process.env.NEXT_PUBLIC_RPC_URL_56,
};

export function rpcUrl(chainId: number): string | undefined {
  return RPC_URLS[chainId];
}
