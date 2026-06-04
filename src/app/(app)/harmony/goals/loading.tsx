import { CardsSkeleton, PageHeaderSkeleton } from "@/components/shared/loaders";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <CardsSkeleton />
    </>
  );
}
