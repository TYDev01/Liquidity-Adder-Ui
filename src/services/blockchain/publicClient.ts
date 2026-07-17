import { createPublicClient, type PublicClient } from "viem";
import {
  mainnet,
  base,
  arbitrum,
  optimism,
  polygon,
  bsc,
  type Chain,
} from "viem/chains";
import { buildTransport } from "./transports";

/**
 * Standalone viem public clients, keyed by chain id, for reads outside of the
 * React/wagmi lifecycle (e.g. services, server helpers). Clients are memoised.
 */

const VIEM_CHAINS: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [base.id]: base,
  [arbitrum.id]: arbitrum,
  [optimism.id]: optimism,
  [polygon.id]: polygon,
  [bsc.id]: bsc,
};

const cache = new Map<number, PublicClient>();

export function getPublicClient(chainId: number): PublicClient {
  const cached = cache.get(chainId);
  if (cached) return cached;

  const chain = VIEM_CHAINS[chainId];
  if (!chain) {
    throw new Error(`No viem chain registered for chain id ${chainId}`);
  }

  const client = createPublicClient({
    chain,
    transport: buildTransport(chainId),
    batch: { multicall: true },
  }) as PublicClient;

  cache.set(chainId, client);
  return client;
}
