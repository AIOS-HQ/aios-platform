import type { ReactNode } from "react";
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
import { listYouTubeChannels, listYouTubePlaylists, youTubePublishingAdapter } from "@/lib/social-publishing/adapters/youtube";
import { Progress } from "@/components/ui/progress";
import { YouTubeDraftUploader } from "@/components/harmony/social/youtube-draft-uploader";

export const metadata: Metadata = {
  title: "Social",
};

type SocialJobRow = {
  id: string;
  provider: "linkedin" | "x" | "youtube";
  content_type: string;
  title: string;
  caption: string;
  target_identity: string;
  youtube_channel_id: string | null;
  youtube_channel_title: string | null;
  youtube_visibility: string | null;
  youtube_tags: string[];
  youtube_playlist_id: string | null;
  youtube_playlist_title: string | null;
  scheduled_at: string | null;
  upload_progress: number | null;
  processing_status: string | null;
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
  provider: "linkedin" | "x" | "youtube";
  kind: string;
  mime_type: string;
  file_name: string;
  storage_path: string | null;
  page_count: number | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  state: string;
};

type YouTubeChannelOption = {
  id: string;
  title: string;
  customUrl: string | null;
};

type YouTubePlaylistOption = {
  id: string;
  title: string;
  channelId: string | null;
};

type HealthTone = "healthy" | "warning" | "danger";

type CapabilityItem = {
  label: string;
  enabled: boolean;
  detail?: string;
};

type ProviderCardModel = {
  id: "linkedin" | "x" | "youtube";
  name: string;
  description: string;
  tone: HealthTone;
  status: string;
  connection: string;
  readiness: string;
  identity: string;
  checkedAt: string;
  capabilities: CapabilityItem[];
  limitations: string[];
  founderActions: string[];
  diagnostics: Array<{ label: string; value: ReactNode }>;
  action?: ReactNode;
};

function badgeForTone(tone: HealthTone): "success" | "warning" | "destructive" {
  if (tone === "healthy") return "success";
  if (tone === "warning") return "warning";
  return "destructive";
}

function previewHref(storagePath?: string | null): string | null {
  if (!storagePath?.startsWith("public:")) return null;
  return `/${storagePath.slice("public:".length).replace(/^\/+/, "")}`;
}

function providerLabel(provider: string) {
  if (provider === "x") return "X";
  if (provider === "youtube") return "YouTube";
  return "LinkedIn";
}

function formatDateTime(value: string | null): string {
  if (!value) return "Not reported";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not reported";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function listOrNone(items: string[]): string[] {
  return items.length > 0 ? items : ["No outstanding Founder actions reported by the current health check."];
}

function safeScopes(scopes: string[]): string {
  return scopes.length > 0 ? scopes.join(", ") : "Not reported";
}

function connectionLabel(input: { configured: boolean; connected: boolean; healthy: boolean }): {
  tone: HealthTone;
  label: string;
} {
  if (input.healthy) return { tone: "healthy", label: "Healthy" };
  if (!input.configured) return { tone: "warning", label: "Configuration required" };
  if (!input.connected) return { tone: "danger", label: "Disconnected" };
  return { tone: "warning", label: "Needs attention" };
}

export default async function HarmonySocialPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [
    { data: jobs },
    { data: mediaRows },
    linkedinHealth,
    xHealth,
    youtubeHealth,
    youtubeChannels,
    youtubePlaylists,
  ] = await Promise.all([
    supabase
      .from("social_publish_jobs")
      .select("*")
      .eq("user_id", user.id)
      .in("provider", ["linkedin", "x", "youtube"])
      .order("created_at", { ascending: false }),
    supabase
      .from("social_media_assets")
      .select("*")
      .eq("user_id", user.id)
      .in("provider", ["linkedin", "x", "youtube"]),
    getLinkedInPublisherHealth(),
    getProviderHealth(user.id, "x"),
    getProviderHealth(user.id, "youtube"),
    listYouTubeChannels(user.id).catch(() => [] as YouTubeChannelOption[]),
    listYouTubePlaylists(user.id).catch(() => [] as YouTubePlaylistOption[]),
  ]);

  const rows = (jobs ?? []) as SocialJobRow[];
  const assets = (mediaRows ?? []) as SocialAssetRow[];
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

  const pendingApprovals = rows.filter((job) => job.state === "awaiting_approval");
  const approvedDrafts = rows.filter((job) => job.state === "approved");
  const rejectedDrafts = rows.filter((job) => job.state === "cancelled" || job.state === "rejected");
  const published = rows.filter((job) => job.state === "published");
  const failed = rows.filter((job) => job.state === "failed");
  const activeDrafts = rows.filter((job) => ["draft", "preparing_media", "uploading", "publishing"].includes(job.state));
  const scheduled = rows.filter((job) => job.provider === "youtube" && job.scheduled_at && job.state !== "published");
  const retryAvailable = failed;

  const linkedinActions = listOrNone([
    ...(linkedinHealth.publisherConfigured ? [] : ["Set the LinkedIn publisher token in production."]),
    ...(linkedinHealth.organization.urn ? [] : ["Set LINKEDIN_ORGANIZATION_URN or LINKEDIN_ORGANIZATION_ID."]),
    ...(linkedinHealth.signInConfigured ? [] : ["Configure LinkedIn Sign-In OAuth credentials for identity health."]),
    ...(linkedinHealth.permissions.organizationPublish ? [] : ["Confirm Community Management API access and w_organization_social permission."]),
    "Verify the production LinkedIn callback URL in the LinkedIn Developer Portal.",
    ...linkedinHealth.issues.map((issue) => issue.message),
  ]);

  const xActions = listOrNone([
    ...(xHealth.configured ? [] : ["Set the X OAuth client credentials."]),
    ...(xHealth.connected ? [] : ["Connect the exact production X account in Harmony Integrations."]),
    ...(xHealth.warnings.length > 0 ? xHealth.warnings : []),
    ...xHealth.blockers,
    "Verify the production X callback URL in the X Developer Portal.",
    "Confirm X scopes: tweet.read, tweet.write, users.read, media.write, offline.access.",
    "Confirm X API access tier and rate-limit budget for media publishing.",
  ]);

  const youtubeActions = listOrNone([
    ...(youtubeHealth.configured ? [] : ["Set the Google OAuth client credentials."]),
    ...(youtubeHealth.connected ? [] : ["Connect the Founder-owned YouTube account in Harmony Integrations."]),
    ...(youtubeChannels.length > 0 ? [] : ["Reconnect or verify YouTube so Harmony can discover at least one owned channel."]),
    ...youtubeHealth.blockers,
    ...youtubeHealth.warnings,
    "Enable YouTube Data API v3 in Google Cloud.",
    "Verify the production YouTube callback URL in Google Cloud.",
    "Confirm OAuth consent verification for YouTube upload and account-management scopes.",
    "Confirm quota budget for resumable uploads, thumbnail uploads, playlist writes, and processing polling.",
  ]);

  const xConnection = connectionLabel(xHealth);
  const youtubeConnection = connectionLabel(youtubeHealth);
  const providerCards: ProviderCardModel[] = [
    {
      id: "linkedin",
      name: "LinkedIn",
      description: "Organization publisher",
      tone: linkedinHealth.healthy ? "healthy" : "warning",
      status: linkedinHealth.healthy ? "Healthy" : "Configuration required",
      connection: linkedinHealth.publisherConfigured ? "Publisher token present" : "Publisher token missing",
      readiness: linkedinHealth.healthy ? "Ready for Founder-approved publishing" : "Blocked until publisher setup is complete",
      identity: linkedinHealth.organization.name ?? linkedinHealth.organization.urn ?? "Approved organization not configured",
      checkedAt: "Evaluated on page load",
      capabilities: [
        { label: "Text post", enabled: linkedInPublishingAdapter.capabilities.textPost },
        { label: "Document carousel", enabled: linkedInPublishingAdapter.capabilities.documentCarousel },
        { label: "Image post", enabled: Boolean(linkedInPublishingAdapter.capabilities.imagePost), detail: "Not implemented" },
        { label: "Video post", enabled: Boolean(linkedInPublishingAdapter.capabilities.videoPost), detail: "Not implemented" },
      ],
      limitations: [
        "Publishes only to the configured approved organization.",
        "Image and video publishing are unavailable.",
        "Every external publish requires exact-content Founder approval.",
      ],
      founderActions: linkedinActions,
      diagnostics: [
        { label: "API version", value: linkedinHealth.apiVersion },
        { label: "Publisher token", value: linkedinHealth.token.present ? "Present" : "Missing" },
        { label: "Organization read", value: linkedinHealth.permissions.organizationRead ? "Verified" : "Not verified" },
        { label: "Organization publish", value: linkedinHealth.permissions.organizationPublish ? "Verified" : "Not verified" },
      ],
      action: (
        <form action={prepareLinkedInTestDraft}>
          <Button type="submit" size="sm">Prepare LinkedIn test draft</Button>
        </form>
      ),
    },
    {
      id: "x",
      name: "X",
      description: "Connected account publisher",
      tone: xConnection.tone,
      status: xConnection.label,
      connection: xHealth.connected ? "Connected account" : "Not connected",
      readiness: xHealth.healthy ? "Ready for Founder-approved publishing" : "Blocked until OAuth health passes",
      identity: xHealth.identity ?? "Connect X and verify account",
      checkedAt: formatDateTime(xHealth.checkedAt),
      capabilities: [
        { label: "Text post", enabled: xPublishingAdapter.capabilities.textPost },
        { label: "Single image", enabled: xPublishingAdapter.capabilities.imagePost },
        { label: "Multi-image", enabled: xPublishingAdapter.capabilities.multiImagePost },
        { label: "Video post", enabled: xPublishingAdapter.capabilities.videoPost, detail: "Not implemented" },
      ],
      limitations: [
        "Video publishing is unavailable.",
        "Media publishing depends on the connected account scopes and X API limits.",
        "Every external publish requires exact-content Founder approval.",
      ],
      founderActions: xActions,
      diagnostics: [
        { label: "Required scopes", value: safeScopes(xHealth.requiredScopes) },
        { label: "Granted scopes", value: safeScopes(xHealth.grantedScopes) },
        { label: "Token", value: xHealth.token.valid === false ? "Invalid or expired" : xHealth.token.present ? "Present" : "Missing" },
        { label: "Refreshable", value: xHealth.token.refreshable ? "Yes" : "No" },
      ],
      action: (
        <form action={prepareXTestDraft}>
          <Button type="submit" size="sm">Prepare X test draft</Button>
        </form>
      ),
    },
    {
      id: "youtube",
      name: "YouTube",
      description: "Multi-channel video publisher",
      tone: youtubeConnection.tone,
      status: youtubeHealth.healthy ? "Publish-ready" : youtubeConnection.label,
      connection: youtubeHealth.connected ? "Connected account" : "Not connected",
      readiness: youtubeHealth.healthy ? "Ready for Founder-approved video publishing" : "Blocked until OAuth, scopes, and channel discovery pass",
      identity: youtubeChannels.length > 0
        ? youtubeChannels.map((channel) => channel.title).join(", ")
        : youtubeHealth.identity ?? "Connect YouTube to verify channel identity",
      checkedAt: formatDateTime(youtubeHealth.checkedAt),
      capabilities: [
        { label: "Channel discovery", enabled: Boolean(youtubeHealth.capabilities.list_channels || youtubeHealth.capabilities.read_channel) },
        { label: "Channel switching", enabled: youTubePublishingAdapter.capabilities.channelSwitching },
        { label: "Playlist selection", enabled: youTubePublishingAdapter.capabilities.playlistSelection },
        { label: "Video upload", enabled: youTubePublishingAdapter.capabilities.videoUpload },
        { label: "Thumbnail upload", enabled: youTubePublishingAdapter.capabilities.thumbnailUpload },
        { label: "Scheduled publishing", enabled: youTubePublishingAdapter.capabilities.scheduledPublishing },
        { label: "Shorts publishing", enabled: youTubePublishingAdapter.capabilities.shortsPublishing },
      ],
      limitations: [
        "Every upload requires exact-content Founder approval before any YouTube write call.",
        "Live analytics, comments, Creator Studio sync, and livestream workflows are not implemented.",
        "YouTube quota and OAuth verification remain external Google Cloud controls.",
      ],
      founderActions: youtubeActions,
      diagnostics: [
        { label: "Required scopes", value: safeScopes(youtubeHealth.requiredScopes) },
        { label: "Granted scopes", value: safeScopes(youtubeHealth.grantedScopes) },
        { label: "Token", value: youtubeHealth.token.valid === false ? "Invalid or expired" : youtubeHealth.token.present ? "Present" : "Missing" },
        { label: "Channels", value: youtubeChannels.length },
        { label: "Playlists", value: youtubePlaylists.length },
        { label: "Upload scope", value: youtubeHealth.grantedScopes.includes("https://www.googleapis.com/auth/youtube.upload") ? "Granted" : "Missing" },
      ],
      action: <YouTubeDraftUploader channels={youtubeChannels} playlists={youtubePlaylists} disabled={!youtubeHealth.healthy || youtubeChannels.length === 0} />,
    },
  ];

  const healthCounts = {
    healthy: providerCards.filter((provider) => provider.tone === "healthy").length,
    warning: providerCards.filter((provider) => provider.tone === "warning").length,
    danger: providerCards.filter((provider) => provider.tone === "danger").length,
  };
  const allFounderActions = providerCards.flatMap((provider) =>
    provider.founderActions.map((action) => `${provider.name}: ${action}`),
  );

  return (
    <>
      <PageHeader
        title="Social"
        description="Founder command center for social publishing readiness, approvals, drafts, history, and safe provider diagnostics."
      />

      <div className="space-y-6">
        <section aria-labelledby="health-summary" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="health-summary" className="text-lg font-semibold">
                Provider health
              </h2>
              <p className="text-sm text-muted-foreground">
                Unified readiness across connection, identity, scopes, and publisher preflight.
              </p>
            </div>
            <Badge variant={healthCounts.danger > 0 ? "destructive" : healthCounts.warning > 0 ? "warning" : "success"}>
              {healthCounts.healthy} healthy · {healthCounts.warning} configuration required · {healthCounts.danger} disconnected
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile label="Pending approvals" value={pendingApprovals.length} />
            <StatTile label="Approved drafts" value={approvedDrafts.length} />
            <StatTile label="Failed / retryable" value={retryAvailable.length} />
            <StatTile label="Published" value={published.length} />
            <StatTile label="Founder actions" value={allFounderActions.length} />
          </div>
        </section>

        <section aria-labelledby="providers" className="space-y-3">
          <h2 id="providers" className="text-lg font-semibold">
            Provider operations
          </h2>
          <div className="grid gap-4 xl:grid-cols-3">
            {providerCards.map((provider) => (
              <ProviderOperationsCard key={provider.id} provider={provider} />
            ))}
          </div>
        </section>

        <section aria-labelledby="founder-actions" className="space-y-3">
          <h2 id="founder-actions" className="text-lg font-semibold">
            Outstanding Founder actions
          </h2>
          <Card>
            <CardContent className="space-y-3 p-4 text-sm">
              {allFounderActions.length === 0 ? (
                <p className="text-muted-foreground">No outstanding manual setup actions reported.</p>
              ) : (
                <ul className="grid gap-2 md:grid-cols-2">
                  {allFounderActions.map((action) => (
                    <li key={action} className="rounded-md border bg-muted/30 px-3 py-2">
                      {action}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="publishing-work" className="space-y-3">
          <h2 id="publishing-work" className="text-lg font-semibold">
            Publishing work
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <JobSection
              title="Pending approvals"
              description="Drafts waiting for exact-content Founder approval."
              jobs={pendingApprovals}
              assetsById={assetsById}
            />
            <JobSection
              title="Approved drafts"
              description="Ready to publish. Failed jobs are retryable only while the approved hash still matches."
              jobs={approvedDrafts}
              assetsById={assetsById}
            />
            <JobSection
              title="Rejected drafts"
              description="No separate rejected state exists yet; cancelled jobs are shown here when present."
              jobs={rejectedDrafts}
              assetsById={assetsById}
            />
            <JobSection
              title="Failed / retry available"
              description="Retry remains gated by provider health and exact-content approval."
              jobs={retryAvailable}
              assetsById={assetsById}
            />
            <JobSection
              title="Scheduled work"
              description="YouTube jobs with a scheduled publish time. Publishing sends the approved schedule to YouTube."
              jobs={scheduled}
              assetsById={assetsById}
              emptyText="No scheduled YouTube publishing jobs."
            />
            <JobSection
              title="Published history"
              description="Provider IDs and URLs appear only after real provider responses."
              jobs={published}
              assetsById={assetsById}
              readOnly
            />
          </div>
          {activeDrafts.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Drafts in progress</CardTitle>
                <CardDescription>Jobs currently preparing media, uploading, or publishing.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeDrafts.map((job) => (
                  <SocialJobCard key={job.id} job={job} assetsById={assetsById} />
                ))}
              </CardContent>
            </Card>
          ) : null}
        </section>
      </div>
    </>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ProviderOperationsCard({ provider }: { provider: ProviderCardModel }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{provider.name}</CardTitle>
            <CardDescription>{provider.description}</CardDescription>
          </div>
          <Badge variant={badgeForTone(provider.tone)}>{provider.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <dl className="grid gap-2">
          <DetailRow label="Connection" value={provider.connection} />
          <DetailRow label="Publisher readiness" value={provider.readiness} />
          <DetailRow label="Identity" value={provider.identity} />
          <DetailRow label="Last health check" value={provider.checkedAt} />
        </dl>

        <div>
          <p className="mb-2 font-medium">Capabilities</p>
          <CapabilityList capabilities={provider.capabilities} />
        </div>

        <div>
          <p className="mb-2 font-medium">Current limitations</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {provider.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-2 font-medium">Founder actions</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {provider.founderActions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-2 font-medium">Safe diagnostics</p>
          <dl className="grid gap-2">
            {provider.diagnostics.map((item) => (
              <DetailRow key={item.label} label={item.label} value={item.value} />
            ))}
          </dl>
        </div>

        {provider.action ? <div className="pt-1">{provider.action}</div> : null}
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function CapabilityList({ capabilities }: { capabilities: CapabilityItem[] }) {
  return (
    <dl className="grid gap-2">
      {capabilities.map((capability) => (
        <div key={capability.label} className="flex items-center justify-between gap-3">
          <dt>
            <span>{capability.label}</span>
            {capability.detail ? <span className="ml-2 text-xs text-muted-foreground">{capability.detail}</span> : null}
          </dt>
          <dd>
            {capability.enabled ? (
              <Badge variant="success">available</Badge>
            ) : (
              <Badge variant="outline">unavailable</Badge>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function JobSection({
  title,
  description,
  jobs,
  assetsById,
  emptyText = "No jobs in this group.",
  readOnly = false,
}: {
  title: string;
  description: string;
  jobs: SocialJobRow[];
  assetsById: Map<string, SocialAssetRow>;
  emptyText?: string;
  readOnly?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge variant="secondary" className="tabular-nums">{jobs.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          jobs.map((job) => <SocialJobCard key={job.id} job={job} assetsById={assetsById} readOnly={readOnly} />)
        )}
      </CardContent>
    </Card>
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
          {job.provider === "youtube" ? (
            <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
              <p>Channel: {job.youtube_channel_title ?? job.youtube_channel_id ?? job.target_identity}</p>
              <p>Visibility: {job.youtube_visibility ?? "Not set"}</p>
              <p>Playlist: {job.youtube_playlist_title ?? job.youtube_playlist_id ?? "None"}</p>
              <p>Scheduled: {formatDateTime(job.scheduled_at)}</p>
              <p>Processing: {job.processing_status ?? "Not started"}</p>
              <p>Tags: {(job.youtube_tags ?? []).length > 0 ? job.youtube_tags.join(", ") : "None"}</p>
            </div>
          ) : null}
          {job.provider === "youtube" && job.upload_progress != null ? (
            <div className="max-w-md space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Upload progress</span>
                <span>{job.upload_progress}%</span>
              </div>
              <Progress value={job.upload_progress} className="h-1.5" />
            </div>
          ) : null}
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
                {job.state === "failed" ? "Retry publish" : "Publish"}
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
        {asset.duration_seconds ? ` | ${asset.duration_seconds}s` : ""}
        {asset.width && asset.height ? ` | ${asset.width}x${asset.height}` : ""}
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
