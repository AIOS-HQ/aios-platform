import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import { getLinkedInPublisherHealth } from "@/lib/integrations/linkedin-publisher";
import { getProviderHealth } from "@/lib/integrations/connector-health";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  approveSocialDraft,
  prepareLinkedInTestDraft,
  prepareXTestDraft,
  publishSocialDraft,
} from "@/lib/social-publishing/actions";

export const metadata: Metadata = {
  title: "Social Publishing",
};

function statusVariant(ok: boolean): "success" | "destructive" {
  return ok ? "success" : "destructive";
}

export default async function HarmonySocialPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: jobs }, linkedinHealth, xHealth] = await Promise.all([
    supabase
      .from("social_publish_jobs")
      .select("*")
      .eq("user_id", user.id)
      .in("provider", ["linkedin", "x"])
      .order("created_at", { ascending: false }),
    getLinkedInPublisherHealth(),
    getProviderHealth(user.id, "x"),
  ]);

  const rows = (jobs ?? []) as Array<{
    id: string;
    provider: "linkedin" | "x";
    content_type: string;
    title: string;
    caption: string;
    target_identity: string;
    state: string;
    provider_post_id: string | null;
    provider_post_url: string | null;
    last_error: string | null;
    created_at: string;
  }>;

  return (
    <>
      <PageHeader
        title="Harmony Social Publishing"
        description="Prepare LinkedIn PDF carousel and X multi-image posts. Publishing remains Founder-approved."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>LinkedIn Publisher</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Badge variant={statusVariant(linkedinHealth.healthy)}>
              {linkedinHealth.healthy ? "Healthy" : "Blocked"}
            </Badge>
            <p className="text-muted-foreground">
              Organization: {linkedinHealth.organization.name ?? linkedinHealth.organization.urn ?? "Not configured"}
            </p>
            <p className="text-muted-foreground">
              Capabilities: textPost, documentCarousel
            </p>
            <form action={prepareLinkedInTestDraft}>
              <Button type="submit" size="sm">Prepare LinkedIn test draft</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>X Publishing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Badge variant={statusVariant(xHealth.healthy)}>
              {xHealth.healthy ? "Healthy" : "Blocked"}
            </Badge>
            <p className="text-muted-foreground">
              Account: {xHealth.identity ?? "Connect X and verify account"}
            </p>
            <p className="text-muted-foreground">
              Capabilities: textPost, imagePost, multiImagePost. videoPost unavailable.
            </p>
            <form action={prepareXTestDraft}>
              <Button type="submit" size="sm">Prepare X test draft</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Founder Approval Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No social publishing drafts yet.</p>
            ) : (
              rows.map((job) => (
                <div key={job.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{job.title}</p>
                        <Badge variant="outline">{job.provider}</Badge>
                        <Badge variant="secondary">{job.state}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">Target: {job.target_identity}</p>
                      <p className="mt-2 max-w-3xl text-sm">{job.caption}</p>
                      {job.provider_post_url ? (
                        <a className="mt-2 block text-sm underline" href={job.provider_post_url}>
                          {job.provider_post_url}
                        </a>
                      ) : null}
                      {job.last_error ? <p className="mt-2 text-sm text-destructive">{job.last_error}</p> : null}
                    </div>
                    <div className="flex gap-2">
                      <form action={approveSocialDraft}>
                        <input type="hidden" name="job_id" value={job.id} />
                        <Button type="submit" size="sm" variant="outline" disabled={job.state === "published"}>
                          Approve exact content
                        </Button>
                      </form>
                      <form action={publishSocialDraft}>
                        <input type="hidden" name="job_id" value={job.id} />
                        <input type="hidden" name="provider" value={job.provider} />
                        <Button type="submit" size="sm" disabled={job.state !== "approved" && job.state !== "failed"}>
                          Publish
                        </Button>
                      </form>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>YouTube Tomorrow</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Multi-channel YouTube setup is scheduled for the next implementation phase. Upload and publish
              capabilities remain unavailable tonight.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
