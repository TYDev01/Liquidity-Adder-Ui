import { getChainConfig } from "@/constants/dex";

/** Build block-explorer URLs for a given chain. */

export function txUrl(chainId: number, hash: string): string {
  return `${getChainConfig(chainId).explorerUrl}/tx/${hash}`;
}

export function addressUrl(chainId: number, address: string): string {
  return `${getChainConfig(chainId).explorerUrl}/address/${address}`;
}

export function tokenUrl(chainId: number, address: string): string {
  return `${getChainConfig(chainId).explorerUrl}/token/${address}`;
}
