import { PageHeaderSkeleton, CardsSkeleton } from "@/components/shared/loaders";

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <CardsSkeleton count={4} />
    </>
  );
}
