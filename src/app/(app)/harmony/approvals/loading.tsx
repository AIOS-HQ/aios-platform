import { PageHeaderSkeleton, ListSkeleton } from "@/components/shared/loaders";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <ListSkeleton rows={5} />
    </>
  );
}
