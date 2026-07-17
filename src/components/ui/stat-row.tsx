import * as React from "react";
import { cn } from "@/lib/utils";

/** A label/value row used throughout the info panels. */
export function StatRow({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "danger" | "warning" | "success";
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-1.5", className)}>
      <span className="text-sm text-muted-foreground" title={hint}>
        {label}
      </span>
      <span
        className={cn(
          "text-sm font-medium tabular-nums",
          tone === "danger" && "text-destructive",
          tone === "warning" && "text-yellow-400",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </span>
    </div>
  );
}
