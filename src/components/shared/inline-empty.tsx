import type { LucideIcon } from "lucide-react";

/**
 * Compact empty placeholder for in-card / in-section use — lighter than the
 * page-level EmptyState. Icon + short message + optional CTA, on a dashed card
 * so empty sections read as intentional rather than broken.
 */
export function InlineEmpty({
  icon: Icon,
  message,
  children,
}: {
  icon?: LucideIcon;
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
      {Icon && (
        <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
      <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}
