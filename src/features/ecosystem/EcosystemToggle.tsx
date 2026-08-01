"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ECOSYSTEM_LIST, type Ecosystem } from "@/constants/ecosystem";
import { useEcosystemStore } from "./store";
import { useMounted } from "@/hooks/useMounted";
import { cn } from "@/lib/utils";

/**
 * EVM ⇄ Solana switch. The two ecosystems have separate wallet connections and
 * separate liquidity stacks, so this swaps the whole panel rather than acting
 * as a filter.
 */
export function EcosystemToggle() {
  const mounted = useMounted();
  const ecosystem = useEcosystemStore((s) => s.ecosystem);
  const setEcosystem = useEcosystemStore((s) => s.setEcosystem);

  // Avoid a hydration mismatch: the persisted value isn't known server-side.
  const active: Ecosystem = mounted ? ecosystem : "evm";

  return (
    <div
      role="tablist"
      aria-label="Ecosystem"
      className="flex rounded-2xl bg-secondary/40 p-1"
    >
      {ECOSYSTEM_LIST.map((meta) => {
        const selected = active === meta.id;
        return (
          <button
            key={meta.id}
            role="tab"
            aria-selected={selected}
            onClick={() => setEcosystem(meta.id)}
            className={cn(
              "relative flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              selected
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {selected && (
              <motion.span
                layoutId="ecosystem-pill"
                className="absolute inset-0 rounded-xl bg-background shadow"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}
