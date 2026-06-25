import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton } from "@/components/shared/loaders";

/**
 * Route-level skeleton for the Harmony workspace — the heaviest route (it builds
 * Executive Awareness, then chat / suggestions / memory). Mirrors the page's
 * shape (header, the awareness strip, the Chat / Suggestions / Memory tab bar,
 * and the chat panel) so the perceived load is smooth rather than a generic
 * card grid. Decorative only.
 */
export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />

      {/* Executive Awareness strip */}
      <Skeleton className="mb-4 h-16 w-full rounded-xl" aria-hidden="true" />

      {/* Chat / Suggestions / Memory tab bar */}
      <div className="mb-4 flex gap-2 border-b pb-2" aria-hidden="true">
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-28 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>

      {/* Conversation panel */}
      <Skeleton
        className="h-[calc(100dvh-22rem)] min-h-[20rem] w-full rounded-xl"
        aria-hidden="true"
      />
    </>
  );
}
