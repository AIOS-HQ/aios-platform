import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Subscriber Feedback" };

export default function CustomerExperienceFeedbackPage() {
  return (
    <>
      <PageHeader
        title="Feedback"
        description="Customer feedback operations. No feedback-content store is currently configured, so this page shows setup status rather than fake feedback."
      >
        <Button asChild size="sm" variant="outline">
          <Link href="/harmony/comms">Open Communications</Link>
        </Button>
      </PageHeader>
      <Card>
        <CardContent className="flex gap-4 p-5">
          <MessageSquare className="size-5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold">Configuration required</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect an approved support channel, CRM, or feedback store before reporting volume, sentiment, or top requests.
              Ambassador can handle authorized conversations only through connected channels and approval policy.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
