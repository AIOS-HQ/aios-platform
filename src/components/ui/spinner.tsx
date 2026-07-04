import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Inline loading spinner (respects reduced-motion via the global keyframe rule). */
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn("size-4 animate-spin text-muted-foreground", className)}
      aria-hidden="true"
    />
  );
}

/** Centered loading state with a label, for panels and route-level fallbacks. */
export function LoadingState({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Spinner />
      <span>{label}</span>
    </div>
  );
}
