"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { AddLiquidityForm } from "./AddLiquidityForm";
import { RemoveLiquidityForm } from "./RemoveLiquidityForm";
import { SettingsPopover } from "./SettingsPopover";
import type { PoolInfo, TokenInfo } from "@/types";
import { cn } from "@/lib/utils";

type Tab = "add" | "remove";

/** Tabbed container switching between add/create and remove liquidity. */
export function LiquidityPanel({
  token,
  pool,
  nativeUsd,
  onSuccess,
}: {
  token: TokenInfo;
  pool: PoolInfo;
  nativeUsd?: number;
  onSuccess?: () => void;
}) {
  const [tab, setTab] = React.useState<Tab>("add");
  const hasPosition = (pool.lpBalance ?? 0n) > 0n;

  const addLabel = pool.exists ? "Add" : "Create";

  return (
    <div className="rounded-3xl border border-border bg-card/40 p-1.5">
      <div className="flex items-center justify-between gap-2 p-2">
        <div className="flex rounded-xl bg-secondary/40 p-1">
          <TabButton active={tab === "add"} onClick={() => setTab("add")}>
            {addLabel} Liquidity
          </TabButton>
          <TabButton
            active={tab === "remove"}
            onClick={() => setTab("remove")}
            disabled={!hasPosition}
          >
            Remove
          </TabButton>
        </div>
        <SettingsPopover />
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, x: tab === "add" ? -8 : 8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="p-3"
      >
        {tab === "add" ? (
          <AddLiquidityForm
            token={token}
            pool={pool}
            nativeUsd={nativeUsd}
            onSuccess={onSuccess}
          />
        ) : (
          <RemoveLiquidityForm token={token} pool={pool} onSuccess={onSuccess} />
        )}
      </motion.div>
    </div>
  );
}

function TabButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId="tab-pill"
          className="absolute inset-0 rounded-lg bg-background shadow"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}
