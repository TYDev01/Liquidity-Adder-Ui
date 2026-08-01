import { Connection, type Commitment } from "@solana/web3.js";
import { SOLANA_FALLBACK_RPC } from "@/constants/solana";

/**
 * Solana RPC access — the counterpart to `services/blockchain/publicClient.ts`.
 *
 * A single `Connection` is memoised per process. The public mainnet endpoint is
 * only a fallback: it is heavily rate-limited and rejects the `getProgramAccounts`
 * calls the AMM SDKs rely on, so a dedicated RPC is effectively required for
 * real use.
 */

const COMMITMENT: Commitment = "confirmed";

let cached: Connection | undefined;

export function getSolanaRpcUrl(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || SOLANA_FALLBACK_RPC;
}

/** True when the app is falling back to the throttled public endpoint. */
export function isUsingFallbackRpc(): boolean {
  return getSolanaRpcUrl() === SOLANA_FALLBACK_RPC;
}

export function getConnection(): Connection {
  if (!cached) {
    cached = new Connection(getSolanaRpcUrl(), {
      commitment: COMMITMENT,
      // Pool creation and multi-position deposits can take a while to land.
      confirmTransactionInitialTimeout: 90_000,
    });
  }
  return cached;
}

/**
 * Websocket endpoint, derived from the HTTP one unless overridden. Returned
 * for the wallet-adapter provider, which manages its own subscription.
 */
export function getSolanaWsUrl(): string | undefined {
  const explicit = process.env.NEXT_PUBLIC_SOLANA_WS_URL?.trim();
  if (explicit) return explicit;
  return undefined;
}
