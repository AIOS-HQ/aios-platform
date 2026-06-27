import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton placeholders used by route-level `loading.tsx` files. */

export function PageHeaderSkeleton() {
  return (
    <div
      className="mb-7 rounded-xl border bg-card/70 px-5 py-4 shadow-soft sm:px-6"
      aria-hidden="true"
    >
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-xl" />
      ))}
    </div>
  );
}
