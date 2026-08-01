/**
 * Ecosystem layer.
 *
 * The app spans two fundamentally different runtimes: EVM chains (wagmi/viem,
 * ERC-20, Uniswap-V2-style routers) and Solana (web3.js, SPL mints, per-program
 * AMM SDKs). They cannot share a wallet connection or a client, so the UI keeps
 * exactly one ecosystem "active" at a time and mounts the matching stack.
 *
 * Everything below the UI reads the active ecosystem from here rather than
 * assuming EVM.
 */

export type Ecosystem = "evm" | "solana";

export interface EcosystemMeta {
  id: Ecosystem;
  name: string;
  /** Short label used on the toggle. */
  label: string;
  /** What the address input expects, shown as placeholder/help text. */
  addressLabel: string;
  addressPlaceholder: string;
}

export const ECOSYSTEMS: Record<Ecosystem, EcosystemMeta> = {
  evm: {
    id: "evm",
    name: "EVM",
    label: "EVM",
    addressLabel: "ERC-20 contract address",
    addressPlaceholder: "0x… token contract address",
  },
  solana: {
    id: "solana",
    name: "Solana",
    label: "Solana",
    addressLabel: "SPL token mint address",
    addressPlaceholder: "Token mint address (base58)",
  },
};

export const ECOSYSTEM_LIST: EcosystemMeta[] = [
  ECOSYSTEMS.evm,
  ECOSYSTEMS.solana,
];

export const DEFAULT_ECOSYSTEM: Ecosystem =
  (process.env.NEXT_PUBLIC_DEFAULT_ECOSYSTEM as Ecosystem) ?? "evm";
