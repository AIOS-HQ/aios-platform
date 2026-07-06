import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PublishForm } from "@/components/marketplace/publish-form";

export const metadata: Metadata = { title: "Publish to Marketplace" };

/**
 * Publish to Marketplace — create a new AI worker / skill / workflow / template
 * listing. Founder-gated via the /harmony layout; the item is created in the
 * author's private catalog (unverified) and reviewed before public listing.
 */
export default async function MarketplacePublishPage() {
  await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  return (
    <>
      <PageHeader
        title="Publish to Marketplace"
        description="List an AI worker, skill, workflow, or template for your company — and, once verified, the public marketplace."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/harmony/marketplace">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to Marketplace
          </Link>
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-5">
          <PublishForm companyId={companyId} />
        </CardContent>
      </Card>
    </>
  );
}
