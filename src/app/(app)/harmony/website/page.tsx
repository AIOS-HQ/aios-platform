import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowRight, Globe2 } from "lucide-react";
import { getWebsiteOperationsSnapshot } from "@/lib/website-operations/status";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  ExecutiveList,
  ExecutiveSection,
  MetricTile,
  SignalPill,
} from "@/components/shared/executive";

export const metadata: Metadata = { title: "Website Operations" };

function tone(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  if (status === "pass" || status === "complete") return "success";
  if (status === "configuration_required" || status === "partial") return "warning";
  if (status === "not_tracked") return "info";
  return "neutral";
}

export default function WebsiteOperationsPage() {
  const snapshot = getWebsiteOperationsSnapshot();
  const routes = [
    ["/harmony/website/analytics", "Analytics"],
    ["/harmony/website/visitors", "Visitors"],
    ["/harmony/website/conversions", "Conversions"],
    ["/harmony/website/content", "Content"],
    ["/harmony/website/seo", "SEO"],
    ["/harmony/website/performance", "Performance"],
    ["/harmony/website/reliability", "Reliability"],
    ["/harmony/website/feedback", "Feedback"],
    ["/harmony/website/releases", "Releases"],
  ];

  return (
    <>
      <PageHeader
        title="Website Operations"
        description="Founder operations for the public AIOS acquisition website. Visitor metrics stay configuration-gated until a real analytics provider is connected."
      >
        <Button asChild size="sm">
          <Link href="/">Open public website</Link>
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-8">
        <ExecutiveSection icon={Globe2} title="Website health">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {snapshot.metrics.map((metric) => (
              <MetricTile
                key={metric.label}
                label={metric.label}
                value={metric.value}
                detail={metric.source}
                icon={Activity}
                tone={tone(metric.status)}
              />
            ))}
          </div>
        </ExecutiveSection>

        <ExecutiveSection icon={Globe2} title="Operations routes">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {routes.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="group rounded-xl border bg-card p-4 shadow-[var(--shadow-soft)] transition hover:border-primary/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{label}</p>
                  <ArrowRight className="size-4 text-muted-foreground transition group-hover:text-primary" />
                </div>
              </Link>
            ))}
          </div>
        </ExecutiveSection>

        <ExecutiveSection icon={Globe2} title="Public route matrix">
          <ExecutiveList>
            {snapshot.routes.map((route) => (
              <div key={route.route} className="grid gap-2 p-4 md:grid-cols-[8rem_1fr_auto] md:items-center">
                <code className="text-xs text-muted-foreground">{route.route}</code>
                <div>
                  <p className="text-sm font-medium">{route.purpose}</p>
                  <p className="text-xs text-muted-foreground">CTA: {route.cta}. Metadata: {route.metadata}</p>
                </div>
                <SignalPill tone={tone(route.status)}>{route.status.replace(/_/g, " ")}</SignalPill>
              </div>
            ))}
          </ExecutiveList>
        </ExecutiveSection>

        <ExecutiveSection icon={Activity} title="Founder actions">
          <ExecutiveList>
            {snapshot.founderActions.map((action) => (
              <div key={action} className="p-4 text-sm text-muted-foreground">{action}</div>
            ))}
          </ExecutiveList>
        </ExecutiveSection>
      </div>
    </>
  );
}
