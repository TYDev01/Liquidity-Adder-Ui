"use client";

import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover } from "@/components/ui/popover";
import { Alert } from "@/components/ui/alert";
import { useSettingsStore } from "@/features/liquidity/settingsStore";
import {
  SLIPPAGE_PRESETS,
  HIGH_SLIPPAGE_WARNING_PERCENT,
} from "@/constants/app";
import { cn } from "@/lib/utils";

/** Slippage + deadline settings, persisted globally. */
export function SettingsPopover() {
  const { slippagePercent, deadlineMinutes, setSlippage, setDeadline } =
    useSettingsStore();

  const highSlippage = slippagePercent >= HIGH_SLIPPAGE_WARNING_PERCENT;

  return (
    <Popover
      trigger={({ toggle }) => (
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Transaction settings">
          <Settings2 className="h-4 w-4" />
        </Button>
      )}
    >
      <div className="space-y-4">
        <p className="text-sm font-semibold">Transaction settings</p>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Slippage tolerance</label>
          <div className="flex gap-2">
            {SLIPPAGE_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => setSlippage(preset)}
                className={cn(
                  "flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors",
                  slippagePercent === preset
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border hover:bg-secondary",
                )}
              >
                {preset}%
              </button>
            ))}
            <div className="relative flex-1">
              <Input
                type="number"
                value={slippagePercent}
                min={0}
                step={0.1}
                onChange={(e) => setSlippage(Number(e.target.value))}
                className="h-8 pr-6 text-xs"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                %
              </span>
            </div>
          </div>
          {highSlippage && (
            <Alert tone="warning">
              High slippage increases the risk of an unfavourable trade.
            </Alert>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            Transaction deadline
          </label>
          <div className="relative">
            <Input
              type="number"
              value={deadlineMinutes}
              min={1}
              onChange={(e) => setDeadline(Number(e.target.value))}
              className="h-8 pr-16 text-xs"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              minutes
            </span>
          </div>
        </div>
      </div>
    </Popover>
  );
}
