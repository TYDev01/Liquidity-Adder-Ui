import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import type { Transport } from "viem";
import {
  mainnet,
  base,
  arbitrum,
  optimism,
  polygon,
  bsc,
  type Chain,
} from "wagmi/chains";
import { APP_NAME } from "@/constants/app";
import { SUPPORTED_CHAIN_IDS } from "@/constants/dex";
import { buildTransport } from "./transports";

/**
 * wagmi / RainbowKit configuration.
 *
 * Chains and RPC transports are derived from the DEX configuration layer and
 * environment variables — adding a chain there wires it up here automatically.
 */

const ALL_CHAINS: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [base.id]: base,
  [arbitrum.id]: arbitrum,
  [optimism.id]: optimism,
  [polygon.id]: polygon,
  [bsc.id]: bsc,
};

const enabledChains = SUPPORTED_CHAIN_IDS.map((id) => ALL_CHAINS[id]).filter(
  (c): c is Chain => Boolean(c),
);

// RainbowKit's helper requires a non-empty tuple of chains.
const chains = (enabledChains.length > 0 ? enabledChains : [mainnet]) as [
  Chain,
  ...Chain[],
];

const transports: Record<number, Transport> = Object.fromEntries(
  chains.map((chain) => [chain.id, buildTransport(chain.id)]),
);

export const wagmiConfig = getDefaultConfig({
  appName: APP_NAME,
  projectId:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "DEMO_PROJECT_ID",
  chains,
  transports,
  ssr: true,
});

export { chains as supportedWagmiChains };
