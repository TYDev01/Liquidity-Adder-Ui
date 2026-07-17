import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Hash } from "viem";
import type { StoredTransaction } from "@/types";
import { STORAGE_KEYS, MAX_RECENT_TRANSACTIONS } from "@/constants/app";

/** Persisted recent-transactions log, displayed in the activity panel. */

interface TransactionStore {
  transactions: StoredTransaction[];
  addTransaction: (tx: StoredTransaction) => void;
  updateStatus: (hash: Hash, status: StoredTransaction["status"]) => void;
  clear: () => void;
}

export const useTransactionStore = create<TransactionStore>()(
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

      updateStatus: (hash, status) =>
        set((state) => ({
          transactions: state.transactions.map((t) =>
            t.hash === hash ? { ...t, status } : t,
          ),
        })),

      clear: () => set({ transactions: [] }),
    }),
    { name: STORAGE_KEYS.transactions },
  ),
);
