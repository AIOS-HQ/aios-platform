import type { Metadata } from "next";
import Link from "next/link";
import { Rocket } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Subscriber Releases" };

export default function CustomerExperienceReleasesPage() {
  return (
    <>
      <PageHeader
        title="Releases"
        description="Subscriber-impacting release readiness and rollback awareness."
      >
        <Button asChild size="sm" variant="outline">
          <Link href="/harmony/code">Open Code Department</Link>
        </Button>
      </PageHeader>
      <Card>
        <CardContent className="flex gap-4 p-5">
          <Rocket className="size-5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold">Release metadata</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Release status is currently derived from GitHub/Vercel readiness and PR evidence. Configure those integrations for live deployment status.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
