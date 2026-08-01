import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StoredSolanaTransaction } from "@/types/solana";
import { MAX_RECENT_TRANSACTIONS } from "@/constants/app";

/**
 * Persisted Solana activity log. Kept separate from the EVM store because the
 * records key on a signature rather than a hash + chain id, and because the two
 * lists are never shown together.
 */

interface SolanaTransactionStore {
  transactions: StoredSolanaTransaction[];
  addTransaction: (tx: StoredSolanaTransaction) => void;
  updateStatus: (
    signature: string,
    status: StoredSolanaTransaction["status"],
  ) => void;
  clear: () => void;
}

export const useSolanaTransactionStore = create<SolanaTransactionStore>()(
  persist(
    (set) => ({
      transactions: [],

      addTransaction: (tx) =>
        set((state) => ({
          transactions: [tx, ...state.transactions].slice(
            0,
            MAX_RECENT_TRANSACTIONS,
          ),
        })),

      updateStatus: (signature, status) =>
        set((state) => ({
          transactions: state.transactions.map((t) =>
            t.signature === signature ? { ...t, status } : t,
          ),
        })),

      clear: () => set({ transactions: [] }),
    }),
    { name: "ulm.solana.transactions" },
  ),
);
