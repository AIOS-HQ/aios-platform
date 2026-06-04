import { ListSkeleton, PageHeaderSkeleton } from "@/components/shared/loaders";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <ListSkeleton rows={6} />
    </>
  );
}
