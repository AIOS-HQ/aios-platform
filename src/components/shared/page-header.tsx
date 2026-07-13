import { cn } from "@/lib/utils";
import { PageBack } from "@/components/shared/page-back";

/** Standard page title block with route-aware Back/breadcrumbs, optional
 * description, and an action slot. The app shell owns product branding, so page
 * headers stay focused on location and task context. PageBack auto-hides on
 * top-level routes. */
export function PageHeader({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-8 rounded-xl border bg-card px-5 py-5 shadow-[var(--shadow-soft)] sm:px-6",
        className,
      )}
    >
      <PageBack />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground/95">
              {description}
            </p>
          )}
        </div>
        {children && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
