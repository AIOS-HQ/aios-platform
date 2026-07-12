import { cn } from "@/lib/utils";
import { AiosHarmonyLogo } from "@/components/brand/logo";
import { PageBack } from "@/components/shared/page-back";

/** Standard page title block with route-aware Back/breadcrumbs, optional
 * description, shared AIOS + Harmony branding, and an action slot. PageBack
 * auto-hides on top-level routes. */
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
        "mb-7 rounded-xl border bg-card/70 px-5 py-4 shadow-soft backdrop-blur sm:px-6",
        className,
      )}
    >
      <PageBack />
      <div className="mb-4">
        <AiosHarmonyLogo
          compact
          aiosMarkClassName="size-6"
          harmonyMarkClassName="size-6"
        />
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
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
