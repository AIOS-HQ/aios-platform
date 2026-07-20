import type { Metadata } from "next";
import { Activity, BarChart3 } from "lucide-react";
import { getCustomerExperienceSnapshot } from "@/lib/customer-experience/kpis";
import { PageHeader } from "@/components/shared/page-header";
import { ExecutiveSection, MetricTile } from "@/components/shared/executive";

export const metadata: Metadata = { title: "Subscriber Harmony KPIs" };

export default async function CustomerExperienceAnalyticsPage() {
  const snapshot = await getCustomerExperienceSnapshot();
  const groups = [
    ["Acquisition", snapshot.acquisition],
    ["Activation", snapshot.activation],
    ["Engagement", snapshot.engagement],
    ["Retention", snapshot.retention],
    ["Conversion", snapshot.conversion],
  ] as const;

  return (
    <>
      <PageHeader
        title="Usage & KPIs"
        description="Privacy-conscious Subscriber Harmony metrics. Unavailable analytics are shown as not tracked rather than fabricated."
      />
      <div className="flex flex-col gap-8">
        {groups.map(([title, metrics]) => (
          <ExecutiveSection key={title} icon={BarChart3} title={title}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <MetricTile
                  key={metric.id}
                  label={metric.label}
                  value={metric.value}
                  detail={`${metric.source}: ${metric.detail}`}
                  icon={Activity}
                  tone={metric.status === "pass" ? "success" : metric.status === "warn" ? "warning" : "info"}
                />
              ))}
            </div>
          </ExecutiveSection>
        ))}
      </div>
    </>
  );
}
