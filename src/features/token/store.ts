import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TokenBookmark } from "@/types";
import { STORAGE_KEYS, MAX_SEARCH_HISTORY } from "@/constants/app";
import { addressesEqual } from "@/utils/validation";

/**
 * Persisted token-related UI state: recent searches + starred favorites.
 * Kept separate from ephemeral query state so it survives reloads.
 */

interface TokenStore {
  history: TokenBookmark[];
  favorites: TokenBookmark[];
  addToHistory: (token: TokenBookmark) => void;
  clearHistory: () => void;
  toggleFavorite: (token: TokenBookmark) => void;
  isFavorite: (address: string, chainId: number) => boolean;
}

function sameToken(a: TokenBookmark, address: string, chainId: number) {
  return a.chainId === chainId && addressesEqual(a.address, address);
}

export const useTokenStore = create<TokenStore>()(
  persist(
    (set, get) => ({
      history: [],
      favorites: [],

      addToHistory: (token) =>
        set((state) => {
          const deduped = state.history.filter(
            (t) => !sameToken(t, token.address, token.chainId),
          );
          return {
            history: [token, ...deduped].slice(0, MAX_SEARCH_HISTORY),
          };
        }),

      clearHistory: () => set({ history: [] }),

      toggleFavorite: (token) =>
        set((state) => {
          const exists = state.favorites.some((t) =>
            sameToken(t, token.address, token.chainId),
          );
          return {
            favorites: exists
              ? state.favorites.filter(
                  (t) => !sameToken(t, token.address, token.chainId),
                )
              : [token, ...state.favorites],
          };
        }),

      isFavorite: (address, chainId) =>
        get().favorites.some((t) => sameToken(t, address, chainId)),
    }),
    {
      name: STORAGE_KEYS.favorites,
      // Persist both slices under one key.
      partialize: (state) => ({
        history: state.history,
        favorites: state.favorites,
      }),
    },
  ),
);
