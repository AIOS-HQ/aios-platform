import type { Metadata } from "next";
import { AlertTriangle, Activity } from "lucide-react";
import { getCustomerExperienceSnapshot } from "@/lib/customer-experience/kpis";
import { PageHeader } from "@/components/shared/page-header";
import { ExecutiveSection, MetricTile } from "@/components/shared/executive";

export const metadata: Metadata = { title: "Subscriber Reliability" };

export default async function CustomerExperienceReliabilityPage() {
  const snapshot = await getCustomerExperienceSnapshot();
  return (
    <>
      <PageHeader title="Reliability" description="Customer-facing operational health without customer-content exposure." />
      <ExecutiveSection icon={AlertTriangle} title="Reliability indicators">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {snapshot.reliability.map((metric) => (
            <MetricTile
              key={metric.id}
              label={metric.label}
              value={metric.value}
              detail={`${metric.source}: ${metric.detail}`}
              icon={Activity}
              tone={metric.status === "warn" ? "warning" : "success"}
            />
          ))}
        </div>
      </ExecutiveSection>
    </>
  );
}
