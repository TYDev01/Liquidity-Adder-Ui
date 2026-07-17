import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  default: "bg-secondary text-secondary-foreground",
  success: "bg-success/15 text-success border border-success/30",
  warning: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
  danger: "bg-destructive/15 text-destructive border border-destructive/30",
  info: "bg-primary/15 text-primary border border-primary/30",
};

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
