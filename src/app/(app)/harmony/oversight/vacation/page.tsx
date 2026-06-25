import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  ArrowLeft,
  ArrowRight,
  GraduationCap,
  MessageSquare,
  Pause,
  Plane,
  Play,
  ShieldCheck,
  AlertTriangle,
  ListTodo,
} from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { getOversightSnapshot } from "@/lib/harmony/oversight/snapshot";
import { setAutomationsPaused, teachHarmony } from "@/lib/harmony/oversight/oversight-actions";
import { TEACH_CATEGORIES } from "@/lib/harmony/oversight/teach";
import { PageHeader } from "@/components/shared/page-header";
import { StatTiles, type Stat } from "@/components/harmony/dashboard/stat-tiles";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("oversight");
  return { title: t("vacation.metaTitle") };
}

const selectClass =
  "h-9 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const toneBadge: Record<string, "warning" | "default" | "secondary"> = {
  attention: "warning",
  steady: "default",
  calm: "secondary",
};

/**
 * Vacation Mode — leave the business running and supervise from anywhere.
 * Composes the existing Oversight snapshot (monitor + health), the existing
 * autonomy kill-switch (pause/resume), the supervision view (review/reply), and
 * Teach Harmony (→ Julius). No new systems — a focused, calm away-from-desk lens.
 * Founder-only via the /harmony layout gate.
 */
export default async function VacationModePage() {
  const t = await getTranslations("oversight");
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();
  const s = await getOversightSnapshot(user.id, companyId);
  const isPaused = s.automations.killSwitch;

  const reasons: string[] = [];
  if (s.approvals.highRisk > 0)
    reasons.push(t("health.reasons.highRisk", { count: s.approvals.highRisk }));
  if (s.work.blocked > 0)
    reasons.push(t("health.reasons.blocked", { count: s.work.blocked }));
  if (s.approvals.pending > 0)
    reasons.push(t("health.reasons.pendingApprovals", { count: s.approvals.pending }));
  if (s.pendingHarmonyResponses > 0)
    reasons.push(t("health.reasons.heldResponses", { count: s.pendingHarmonyResponses }));

  const stats: Stat[] = [
    { key: "conversations", label: t("stat.conversations"), value: s.conversations.active, icon: MessageSquare, href: "/harmony/oversight/conversations" },
    { key: "approvals", label: t("stat.approvals"), value: s.approvals.pending, icon: ShieldCheck, href: "/harmony/approvals", emphasis: true },
    { key: "escalations", label: t("stat.escalations"), value: s.escalations.length, icon: AlertTriangle, emphasis: true },
    { key: "work", label: t("stat.work"), value: s.work.inProgress, icon: ListTodo, href: "/harmony/work-items" },
  ];

  return (
    <>
      <Link
        href="/harmony/oversight"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("vacation.back")}
      </Link>

      <PageHeader title={t("vacation.title")} description={t("vacation.subtitle")}>
        <Plane className="size-5 text-primary" aria-hidden="true" />
      </PageHeader>

      {/* Automations pause/resume — flips the existing global kill switch. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t("vacation.automations.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Badge variant={isPaused ? "secondary" : "success"}>
              {isPaused ? t("vacation.automations.paused") : t("vacation.automations.active")}
            </Badge>
            <p className="mt-2 text-sm text-muted-foreground">
              {isPaused ? t("vacation.automations.pausedHint") : t("vacation.automations.activeHint")}
            </p>
          </div>
          <form action={setAutomationsPaused}>
            <input type="hidden" name="paused" value={isPaused ? "false" : "true"} />
            <Button type="submit" size="sm" variant={isPaused ? "default" : "outline"}>
              {isPaused ? (
                <>
                  <Play className="size-4" aria-hidden="true" />
                  {t("vacation.automations.resume")}
                </>
              ) : (
                <>
                  <Pause className="size-4" aria-hidden="true" />
                  {t("vacation.automations.pause")}
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Monitor */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("vacation.monitorTitle")}
      </h2>
      <StatTiles stats={stats} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Business health */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">{t("vacation.healthTitle")}</CardTitle>
              <Badge variant={toneBadge[s.health.tone]}>{t(`health.${s.health.tone}`)}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {s.health.tone === "attention" && reasons.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {reasons.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-muted-foreground">
                    <AlertTriangle className="size-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                    {r}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t(`health.${s.health.tone}Hint`)}</p>
            )}
          </CardContent>
        </Card>

        {/* Review conversations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="size-4 text-primary" aria-hidden="true" />
              {t("vacation.review.title")}
            </CardTitle>
            <CardDescription>{t("vacation.review.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{t("conversations.active", { count: s.conversations.active })}</Badge>
              {s.pendingHarmonyResponses > 0 && (
                <Badge variant="warning">{t("conversations.held", { count: s.pendingHarmonyResponses })}</Badge>
              )}
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/harmony/oversight/conversations">
                {t("vacation.review.open")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Teach Harmony */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="size-4 text-primary" aria-hidden="true" />
              {t("vacation.teachTitle")}
            </CardTitle>
            <CardDescription>{t("vacation.teachSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={teachHarmony} className="space-y-2 sm:max-w-lg">
              <Textarea name="instruction" rows={3} placeholder={t("teach.placeholder")} />
              <label className="text-xs font-medium" htmlFor="vacation-teach-category">
                {t("teach.category.label")}
              </label>
              <select
                id="vacation-teach-category"
                name="category"
                defaultValue="operational_guideline"
                className={selectClass}
              >
                {TEACH_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{t(`teach.category.${c}`)}</option>
                ))}
              </select>
              <Button type="submit" size="sm">{t("teach.save")}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
