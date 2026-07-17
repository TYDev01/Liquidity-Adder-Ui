import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_SLIPPAGE_PERCENT,
  DEFAULT_DEADLINE_MINUTES,
  MAX_SLIPPAGE_PERCENT,
} from "@/constants/app";
import { clampSlippage } from "@/utils/validation";

/** Persisted transaction settings (slippage + deadline). */

interface SettingsStore {
  slippagePercent: number;
  deadlineMinutes: number;
  setSlippage: (percent: number) => void;
  setDeadline: (minutes: number) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      slippagePercent: DEFAULT_SLIPPAGE_PERCENT,
      deadlineMinutes: DEFAULT_DEADLINE_MINUTES,
      setSlippage: (percent) =>
        set({ slippagePercent: clampSlippage(percent, MAX_SLIPPAGE_PERCENT) }),
      setDeadline: (minutes) =>
        set({ deadlineMinutes: Math.max(1, Math.floor(minutes)) }),
    }),
    { name: "ulm.settings" },
  ),
);
