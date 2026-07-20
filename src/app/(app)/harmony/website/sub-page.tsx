import { Globe2 } from "lucide-react";
import type { WebsiteOperationsSnapshot } from "@/lib/website-operations/status";
import { PageHeader } from "@/components/shared/page-header";
import { ExecutiveSection, MetricTile } from "@/components/shared/executive";

export function WebsiteOperationsSubPage({
  title,
  focus,
  snapshot,
}: {
  title: string;
  focus: string;
  snapshot: WebsiteOperationsSnapshot;
}) {
  return (
    <>
      <PageHeader title={`Website ${title}`} description={focus} />
      <ExecutiveSection icon={Globe2} title="Current evidence">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {snapshot.metrics.map((metric) => (
            <MetricTile
              key={metric.label}
              label={metric.label}
              value={metric.value}
              detail={metric.source}
              icon={Globe2}
              tone={metric.status === "pass" ? "success" : metric.status === "configuration_required" ? "warning" : "info"}
            />
          ))}
        </div>
      </ExecutiveSection>
    </>
  );
}
