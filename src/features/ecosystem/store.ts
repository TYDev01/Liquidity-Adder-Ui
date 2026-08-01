import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_ECOSYSTEM, type Ecosystem } from "@/constants/ecosystem";
import {
  DEFAULT_QUOTE_ASSET,
  DEFAULT_SOLANA_PLATFORM,
  type SolanaPlatformId,
} from "@/constants/solana";

/**
 * Which ecosystem the UI is showing, and — on Solana — which venue and quote
 * asset the user picked. Persisted so a return visit lands where they left off.
 */

interface EcosystemStore {
  ecosystem: Ecosystem;
  /** Selected Solana venue. Ignored while `ecosystem === "evm"`. */
  platform: SolanaPlatformId;
  /** Mint the pasted token is paired against (SOL/USDC/USDT). */
  quoteMint: string;
  setEcosystem: (ecosystem: Ecosystem) => void;
  setPlatform: (platform: SolanaPlatformId) => void;
  setQuoteMint: (mint: string) => void;
}

export const useEcosystemStore = create<EcosystemStore>()(
  persist(
    (set) => ({
      ecosystem: DEFAULT_ECOSYSTEM,
      platform: DEFAULT_SOLANA_PLATFORM,
      quoteMint: DEFAULT_QUOTE_ASSET.mint,
      setEcosystem: (ecosystem) => set({ ecosystem }),
      setPlatform: (platform) => set({ platform }),
      setQuoteMint: (quoteMint) => set({ quoteMint }),
    }),
    { name: "ulm.ecosystem" },
  ),
);
