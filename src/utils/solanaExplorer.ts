import { SOLANA_EXPLORER_URL } from "@/constants/solana";

/** Solscan URL builders — the Solana counterpart to `utils/explorer.ts`. */

export function solanaTxUrl(signature: string): string {
  return `${SOLANA_EXPLORER_URL}/tx/${signature}`;
}

export function solanaAccountUrl(address: string): string {
  return `${SOLANA_EXPLORER_URL}/account/${address}`;
}

export function solanaTokenUrl(mint: string): string {
  return `${SOLANA_EXPLORER_URL}/token/${mint}`;
}
