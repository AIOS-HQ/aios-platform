import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowRight, Eye, ShieldCheck, Sparkles, Users } from "lucide-react";
import { getCustomerExperienceSnapshot } from "@/lib/customer-experience/kpis";
import {
  CUSTOMER_EXPERIENCE_ROUTES,
  CUSTOMER_SPECIALIST_OWNERSHIP,
  SUBSCRIBER_HARMONY_ROUTES,
} from "@/lib/customer-experience/routes";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ExecutiveList,
  ExecutiveSection,
  MetricTile,
  SignalPill,
} from "@/components/shared/executive";

export const metadata: Metadata = {
  title: "Customer Experience",
};

function tone(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "pass" || status === "operational" || status === "complete") return "success";
  if (status === "configuration_required" || status === "partial" || status === "warn") return "warning";
  if (status === "not_tracked") return "info";
  return "neutral";
}

export default async function CustomerExperiencePage() {
  const snapshot = await getCustomerExperienceSnapshot();
  const headline = [
    ...snapshot.acquisition,
    ...snapshot.activation.filter((metric) => metric.id === "first_task_proxy" || metric.id === "first_goal_proxy"),
    ...snapshot.engagement.filter((metric) => ["dau", "wau", "mau"].includes(metric.id)),
  ].slice(0, 8);

  return (
    <>
      <PageHeader
        title="Subscriber Harmony"
        description="Founder operations for the private customer product: onboarding, usage, reliability, feedback, releases, and safe preview."
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/harmony/customer-experience/preview">
              <Eye className="size-4" />
              Live preview
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/harmony/website">Public website ops</Link>
          </Button>
        </div>
      </PageHeader>

      <div className="flex flex-col gap-8">
        <ExecutiveSection
          icon={Users}
          title="Customer product KPIs"
          description="Aggregated from durable AIOS records. Private notes, prompts, messages, files, and memory contents are not queried for this dashboard."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {headline.map((metric) => (
              <MetricTile
                key={metric.id}
                label={metric.label}
                value={metric.value}
                detail={`${metric.source}: ${metric.detail}`}
                icon={Activity}
                tone={tone(metric.status)}
              />
            ))}
          </div>
        </ExecutiveSection>

        <ExecutiveSection icon={ShieldCheck} title="Privacy controls">
          <div className="grid gap-3 md:grid-cols-2">
            {snapshot.privacyControls.map((control) => (
              <div key={control} className="rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-[var(--shadow-soft)]">
                {control}
              </div>
            ))}
          </div>
        </ExecutiveSection>

        <ExecutiveSection icon={Sparkles} title="Founder actions">
          <ExecutiveList>
            {snapshot.founderActions.map((action) => (
              <div key={action} className="flex items-center justify-between gap-4 p-4 text-sm">
                <span>{action}</span>
                <Badge variant="outline">Action</Badge>
              </div>
            ))}
          </ExecutiveList>
        </ExecutiveSection>

        <ExecutiveSection icon={Activity} title="Subscriber route matrix">
          <ExecutiveList>
            {SUBSCRIBER_HARMONY_ROUTES.map((route) => (
              <div key={route.route} className="grid gap-2 p-4 md:grid-cols-[12rem_1fr_auto] md:items-center">
                <code className="text-xs text-muted-foreground">{route.route}</code>
                <div>
                  <p className="text-sm font-medium">{route.purpose}</p>
                  <p className="text-xs text-muted-foreground">{route.privacy}</p>
                </div>
                <SignalPill tone={tone(route.status)}>{route.status.replace(/_/g, " ")}</SignalPill>
              </div>
            ))}
          </ExecutiveList>
        </ExecutiveSection>

        <ExecutiveSection icon={Users} title="Founder operations routes">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {CUSTOMER_EXPERIENCE_ROUTES.map((route) => (
              <Link
                key={route.route}
                href={route.route}
                className="group rounded-xl border bg-card p-4 shadow-[var(--shadow-soft)] transition hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{route.route.replace("/harmony/customer-experience", "") || "Overview"}</p>
                    <p className="text-xs leading-5 text-muted-foreground">{route.purpose}</p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground transition group-hover:text-primary" />
                </div>
              </Link>
            ))}
          </div>
        </ExecutiveSection>

        <ExecutiveSection icon={Sparkles} title="AI specialist ownership">
          <div className="grid gap-3 md:grid-cols-2">
            {CUSTOMER_SPECIALIST_OWNERSHIP.map((owner) => (
              <div key={owner.agent} className="rounded-xl border bg-card p-4 shadow-[var(--shadow-soft)]">
                <p className="text-sm font-semibold">{owner.agent}</p>
                <p className="mt-1 text-sm text-muted-foreground">{owner.ownership}</p>
              </div>
            ))}
          </div>
        </ExecutiveSection>
      </div>
    </>
  );
}
