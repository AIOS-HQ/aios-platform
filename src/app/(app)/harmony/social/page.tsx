import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import { getLinkedInPublisherHealth } from "@/lib/integrations/linkedin-publisher";
import { getProviderHealth } from "@/lib/integrations/connector-health";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  approveSocialDraft,
  prepareLinkedInTestDraft,
  prepareXTestDraft,
  publishSocialDraft,
} from "@/lib/social-publishing/actions";
import { linkedInPublishingAdapter } from "@/lib/social-publishing/adapters/linkedin";
import { xPublishingAdapter } from "@/lib/social-publishing/adapters/x";

export const metadata: Metadata = {
  title: "Social",
};

type SocialJobRow = {
  id: string;
  provider: "linkedin" | "x";
  content_type: string;
  title: string;
  caption: string;
  target_identity: string;
  state: string;
  media_asset_ids: string[];
  approved_content_hash: string | null;
  provider_post_id: string | null;
  provider_post_url: string | null;
  last_error: string | null;
  created_at: string;
};

type SocialAssetRow = {
  id: string;
  provider: "linkedin" | "x";
  kind: string;
  mime_type: string;
  file_name: string;
  storage_path: string | null;
  page_count: number | null;
  alt_text: string | null;
  state: string;
};

function statusVariant(ok: boolean): "success" | "destructive" {
  return ok ? "success" : "destructive";
}

function capabilityBadge(enabled: boolean) {
  return enabled ? (
    <Badge variant="success">available</Badge>
  ) : (
    <Badge variant="outline">unavailable</Badge>
  );
}

function providerLabel(provider: string) {
  return provider === "x" ? "X" : "LinkedIn";
}

function previewHref(storagePath?: string | null): string | null {
  if (!storagePath?.startsWith("public:")) return null;
  return `/${storagePath.slice("public:".length).replace(/^\/+/, "")}`;
}

export default async function HarmonySocialPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: jobs }, { data: mediaRows }, linkedinHealth, xHealth, youtubeHealth] = await Promise.all([
    supabase
      .from("social_publish_jobs")
      .select("*")
      .eq("user_id", user.id)
      .in("provider", ["linkedin", "x"])
      .order("created_at", { ascending: false }),
    supabase
      .from("social_media_assets")
      .select("*")
      .eq("user_id", user.id)
      .in("provider", ["linkedin", "x"]),
    getLinkedInPublisherHealth(),
    getProviderHealth(user.id, "x"),
    getProviderHealth(user.id, "youtube"),
  ]);

  const rows = (jobs ?? []) as SocialJobRow[];
  const assets = (mediaRows ?? []) as SocialAssetRow[];
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const awaitingApproval = rows.filter((job) => job.state === "awaiting_approval");
  const ready = rows.filter((job) => job.state === "approved" || job.state === "failed");
  const published = rows.filter((job) => job.state === "published");
  const inProgress = rows.filter((job) => ["draft", "preparing_media", "uploading", "publishing"].includes(job.state));
  const blockers = [
    ...linkedinHealth.issues.map((issue) => `LinkedIn: ${issue.message}`),
    ...xHealth.blockers.map((blocker) => `X: ${blocker}`),
  ];

  return (
    <>
      <PageHeader
        title="Social"
        description="Prepare test posts for approved social providers from inside Harmony. External publishing remains Founder-approved and tied to exact caption and media."
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Social overview</CardTitle>
            <CardDescription>Canonical route: /harmony/social</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Awaiting approval" value={awaitingApproval.length} />
            <StatTile label="Ready to publish" value={ready.length} />
            <StatTile label="Published" value={published.length} />
            <StatTile label="Blockers" value={blockers.length} />
          </CardContent>
        </Card>

        <section aria-labelledby="provider-connections">
          <h2 id="provider-connections" className="mb-3 text-lg font-semibold">
            Provider connections
          </h2>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>LinkedIn</CardTitle>
                <CardDescription>AIOS organization publisher</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Badge variant={statusVariant(linkedinHealth.healthy)}>
                  {linkedinHealth.healthy ? "Healthy" : "Blocked"}
                </Badge>
                <p className="text-muted-foreground">
                  Organization: {linkedinHealth.organization.name ?? linkedinHealth.organization.urn ?? "Not configured"}
                </p>
                <CapabilityList
                  capabilities={{
                    textPost: linkedInPublishingAdapter.capabilities.textPost,
                    documentCarousel: linkedInPublishingAdapter.capabilities.documentCarousel,
                    imagePost: linkedInPublishingAdapter.capabilities.imagePost,
                    videoPost: linkedInPublishingAdapter.capabilities.videoPost,
                  }}
                />
                <form action={prepareLinkedInTestDraft}>
                  <Button type="submit" size="sm">Prepare LinkedIn test draft</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>X</CardTitle>
                <CardDescription>Connected account publisher</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Badge variant={statusVariant(xHealth.healthy)}>
                  {xHealth.healthy ? "Healthy" : "Blocked"}
                </Badge>
                <p className="text-muted-foreground">
                  Account: {xHealth.identity ?? "Connect X and verify account"}
                </p>
                <CapabilityList
                  capabilities={{
                    textPost: xPublishingAdapter.capabilities.textPost,
                    imagePost: xPublishingAdapter.capabilities.imagePost,
                    multiImagePost: xPublishingAdapter.capabilities.multiImagePost,
                    videoPost: xPublishingAdapter.capabilities.videoPost,
                  }}
                />
                <form action={prepareXTestDraft}>
                  <Button type="submit" size="sm">Prepare X test draft</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>YouTube</CardTitle>
                <CardDescription>Future multi-channel milestone</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Badge variant="outline">Not publish-ready</Badge>
                <p className="text-muted-foreground">
                  Connection: {youtubeHealth.connected ? "connected for available read workflows" : "not connected"}
                </p>
                <CapabilityList
                  capabilities={{
                    channelRead: youtubeHealth.connected && youtubeHealth.token.valid !== false,
                    upload: false,
                    publish: false,
                  }}
                />
                <p className="text-muted-foreground">
                  Upload and publish are intentionally unavailable until the YouTube multi-channel milestone.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section aria-labelledby="drafts">
          <h2 id="drafts" className="mb-3 text-lg font-semibold">
            Drafts and approvals
          </h2>
          <Card>
            <CardHeader>
              <CardTitle>Awaiting Founder approval</CardTitle>
              <CardDescription>Approval records the exact caption and media hash before publishing can run.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[...awaitingApproval, ...ready, ...inProgress].length === 0 ? (
                <p className="text-sm text-muted-foreground">No social publishing drafts yet.</p>
              ) : (
                [...awaitingApproval, ...ready, ...inProgress].map((job) => (
                  <SocialJobCard key={job.id} job={job} assetsById={assetsById} />
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Published / recent activity</CardTitle>
              <CardDescription>Provider result IDs and URLs are shown only after a real publish response.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {published.length === 0 ? (
                <p className="text-sm text-muted-foreground">No published social posts yet.</p>
              ) : (
                published.map((job) => <SocialJobCard key={job.id} job={job} assetsById={assetsById} readOnly />)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Blockers</CardTitle>
              <CardDescription>Publishing preflight must pass before external provider calls are made.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {blockers.length === 0 ? (
                <p className="text-muted-foreground">No provider blockers reported.</p>
              ) : (
                <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
                  {blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              )}
              <div className="rounded-lg border p-3">
                <p className="font-medium">Scheduling and analytics</p>
                <p className="mt-1 text-muted-foreground">
                  Scheduled publishing and live social analytics are not implemented in this milestone.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function CapabilityList({ capabilities }: { capabilities: Record<string, boolean> }) {
  return (
    <dl className="grid gap-2">
      {Object.entries(capabilities).map(([name, enabled]) => (
        <div key={name} className="flex items-center justify-between gap-3">
          <dt>{name}</dt>
          <dd>{capabilityBadge(enabled)}</dd>
        </div>
      ))}
    </dl>
  );
}

function SocialJobCard({
  job,
  assetsById,
  readOnly = false,
}: {
  job: SocialJobRow;
  assetsById: Map<string, SocialAssetRow>;
  readOnly?: boolean;
}) {
  const media = job.media_asset_ids.map((id) => assetsById.get(id)).filter(Boolean) as SocialAssetRow[];

  return (
    <article className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{job.title}</h3>
            <Badge variant="outline">{providerLabel(job.provider)}</Badge>
            <Badge variant="secondary">{job.state}</Badge>
            {job.approved_content_hash ? <Badge variant="success">exact content approved</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">Target identity: {job.target_identity}</p>
          <p className="max-w-3xl text-sm">{job.caption}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {media.length === 0 ? (
              <p className="text-sm text-muted-foreground">No media assets attached.</p>
            ) : (
              media.map((asset) => <MediaPreview key={asset.id} asset={asset} />)
            )}
          </div>
          {job.provider_post_id ? (
            <p className="text-sm text-muted-foreground">Provider result: {job.provider_post_id}</p>
          ) : null}
          {job.provider_post_url ? (
            <a className="block text-sm text-primary underline-offset-4 hover:underline" href={job.provider_post_url}>
              {job.provider_post_url}
            </a>
          ) : null}
          {job.last_error ? <p className="text-sm text-destructive">{job.last_error}</p> : null}
        </div>
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
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
        ) : null}
      </div>
    </article>
  );
}

function MediaPreview({ asset }: { asset: SocialAssetRow }) {
  const href = previewHref(asset.storage_path);

  return (
    <div className="rounded-md border bg-muted/30 p-3 text-sm">
      <p className="font-medium">{asset.file_name}</p>
      <p className="text-muted-foreground">
        {asset.kind} | {asset.mime_type} | {asset.state}
        {asset.page_count ? ` | ${asset.page_count} pages` : ""}
      </p>
      {asset.alt_text ? <p className="mt-1 text-muted-foreground">{asset.alt_text}</p> : null}
      {href ? (
        <Link className="mt-2 inline-flex text-primary underline-offset-4 hover:underline" href={href}>
          Open media preview
        </Link>
      ) : null}
    </div>
  );
}
