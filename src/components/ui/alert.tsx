import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger";

const CONFIG: Record<Tone, { className: string; Icon: typeof Info }> = {
  info: {
    className: "border-primary/30 bg-primary/10 text-primary-foreground",
    Icon: Info,
  },
  success: {
    className: "border-success/30 bg-success/10 text-foreground",
    Icon: CheckCircle2,
  },
  warning: {
    className: "border-yellow-500/30 bg-yellow-500/10 text-foreground",
    Icon: AlertTriangle,
  },
  danger: {
    className: "border-destructive/40 bg-destructive/10 text-foreground",
    Icon: XCircle,
  },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { className: toneClass, Icon } = CONFIG[tone];
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-xl border p-3 text-sm",
        toneClass,
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-0.5">
        {title && <p className="font-semibold leading-none">{title}</p>}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
