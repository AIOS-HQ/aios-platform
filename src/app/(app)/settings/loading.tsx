import { ListSkeleton, PageHeaderSkeleton } from "@/components/shared/loaders";

export default function Loading() {
  return (
    <div className="lg:max-w-2xl">
      <PageHeaderSkeleton />
      <ListSkeleton rows={3} />
    </div>
  );
}
