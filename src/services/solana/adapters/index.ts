import type { SolanaPlatformId } from "@/constants/solana";
import type { LiquidityAdapter } from "@/types/solana";
import { raydiumCpmmAdapter, raydiumClmmAdapter } from "./raydium";
import { orcaWhirlpoolAdapter } from "./orca";
import { meteoraDlmmAdapter } from "./meteora";
import { meteoraDammAdapter } from "./meteoraDamm";

/**
 * Venue adapter registry.
 *
 * This is the only place that knows which implementation backs which platform
 * id. Hooks and UI resolve an adapter through `getAdapter` and then speak only
 * the `LiquidityAdapter` interface, so adding a venue is a config entry plus an
 * adapter — no changes anywhere above this layer.
 */

const ADAPTERS: Record<SolanaPlatformId, LiquidityAdapter> = {
  "raydium-cpmm": raydiumCpmmAdapter,
  "raydium-clmm": raydiumClmmAdapter,
  "orca-whirlpool": orcaWhirlpoolAdapter,
  "meteora-dlmm": meteoraDlmmAdapter,
  "meteora-damm": meteoraDammAdapter,
};

export function getAdapter(platform: SolanaPlatformId): LiquidityAdapter {
  const adapter = ADAPTERS[platform];
  if (!adapter) {
    throw new Error(
      `No adapter registered for "${platform}". Add one in services/solana/adapters/index.ts.`,
    );
  }
  return adapter;
}
