import { cn } from "@/lib/utils";

/** Solid pulsing placeholder used for loading states. */
export function Skeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-secondary/60", className)}
    />
  );
}
