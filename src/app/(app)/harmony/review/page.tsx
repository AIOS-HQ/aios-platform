import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Lightbulb, ListTodo } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { getAiosAgent } from "@/lib/workforce/registry";
import { listObjectives } from "@/lib/workforce/objectives";
import { listWorkItems } from "@/lib/workforce/work-queue";
import { listRecommendations } from "@/lib/workforce/recommendations";
import { getPendingApprovalQueue } from "@/lib/harmony/autonomy/review-queue";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReviewQueue } from "@/components/harmony/workforce/review-queue";
import { AgentRecommendations } from "@/components/harmony/workforce/agent-recommendations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("review");
  return { title: t("title") };
}

export default async function ReviewQueuePage() {
  const t = await getTranslations("review");
  const tw = await getTranslations("workforce");
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  const [objectives, work, approvals, recs] = await Promise.all([
    listObjectives(user.id, { companyId, status: "proposed", limit: 100 }),
    listWorkItems(user.id, { companyId, status: "proposed", limit: 100 }),
    getPendingApprovalQueue(user.id, companyId),
    listRecommendations(user.id, { companyId, status: "open", limit: 100 }),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-6 lg:max-w-3xl">
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTodo className="size-4 text-primary" aria-hidden="true" />
              {t("title")}
            </CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ReviewQueue
              objectives={objectives.map((o) => ({
                id: o.id,
                agent: o.agent,
                agentName: getAiosAgent(o.agent)?.name ?? o.agent,
                title: o.title,
              }))}
              work={work.map((wk) => ({
                id: wk.id,
                agent: wk.agent,
                agentName: getAiosAgent(wk.agent)?.name ?? wk.agent,
                title: wk.title,
                risk: wk.risk,
              }))}
              approvals={approvals.map((a) => ({
                approvalId: a.approvalId,
                agent: a.agent,
                agentName: getAiosAgent(a.agent)?.name ?? a.agent,
                label: a.label,
                destructive: a.destructive,
              }))}
            />
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="size-4 text-primary" aria-hidden="true" />
              {tw("recommendations")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AgentRecommendations
              showAgent
              recommendations={recs.map((r) => ({
                id: r.id,
                agent: r.agent,
                agentName: getAiosAgent(r.agent)?.name ?? r.agent,
                title: r.title,
                detail: r.detail,
                rationale: r.rationale,
                status: r.status,
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
