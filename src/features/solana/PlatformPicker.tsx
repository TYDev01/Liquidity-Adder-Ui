"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import {
  SOLANA_PLATFORMS,
  SOLANA_PLATFORM_IDS,
  type SolanaPlatformConfig,
  type SolanaPlatformId,
} from "@/constants/solana";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Venue selector for Solana. Groups entries by protocol family and labels each
 * with its pool model, because the model — not the brand — is what changes the
 * deposit flow the user is about to see.
 */

const MODEL_LABEL: Record<SolanaPlatformConfig["poolModel"], string> = {
  "constant-product": "Full range",
  concentrated: "Price range",
  bins: "Bins",
};

export function PlatformPicker({
  value,
  onChange,
  disabled,
}: {
  value: SolanaPlatformId;
  onChange: (id: SolanaPlatformId) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const selected = SOLANA_PLATFORMS[value];

  // Close on outside click / Escape.
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const grouped = React.useMemo(() => {
    const groups = new Map<string, SolanaPlatformConfig[]>();
    for (const id of SOLANA_PLATFORM_IDS) {
      const config = SOLANA_PLATFORMS[id];
      const list = groups.get(config.family) ?? [];
      list.push(config);
      groups.set(config.family, list);
    }
    return [...groups.entries()];
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        Platform
      </label>

      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-background/40 p-3.5 text-left transition-colors",
          "hover:border-border/80 disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-primary/60",
        )}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">
              {selected.name}
            </span>
            <Badge tone="default">{MODEL_LABEL[selected.poolModel]}</Badge>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {selected.tagline}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            role="listbox"
            className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            <div className="max-h-[22rem] overflow-y-auto p-1.5">
              {grouped.map(([family, configs]) => (
                <div key={family} className="mb-1 last:mb-0">
                  <p className="px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    {family}
                  </p>
                  {configs.map((config) => {
                    const isSelected = config.id === value;
                    return (
                      <button
                        key={config.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onChange(config.id);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                          isSelected
                            ? "bg-primary/10"
                            : "hover:bg-secondary/60",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold">
                              {config.name}
                            </span>
                            <Badge tone="default">
                              {MODEL_LABEL[config.poolModel]}
                            </Badge>
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {config.tagline}
                          </span>
                        </span>
                        {isSelected && (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
