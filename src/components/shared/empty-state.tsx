import type { LucideIcon } from "lucide-react";

/** Friendly placeholder shown when a list has no items yet. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/70 p-10 text-center shadow-soft">
      {Icon && (
        <span className="mb-4 flex size-12 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
          <Icon className="size-6" aria-hidden="true" />
        </span>
      )}
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
