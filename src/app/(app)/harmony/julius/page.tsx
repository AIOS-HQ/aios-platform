import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Network } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { listJuliusEntries, type JuliusKind } from "@/lib/julius/service";
import { buildHarmonyReflection } from "@/lib/harmony/reflection";
import { JULIUS, WORKFORCE_SPECIALISTS, getAiosAgent } from "@/lib/workforce/registry";
import { AGENT_ICONS, JULIUS_ICON } from "@/lib/workforce/agent-icons";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { HarmonyReflectButton } from "@/components/harmony/harmony-reflect-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("julius");
  return { title: t("title") };
}

/**
 * Julius — the Company Brain. A functional, clickable destination (reached from
 * the Workforce directory) for the AIOS organizational memory: Julius sits at
 * the center as the Company Brain, the specialist workforce reads from and
 * contributes to it, and Harmony coordinates them. This page surfaces the brain
 * CONTENT — objectives, decisions, activity, and knowledge the agents have
 * recorded — plus Harmony's executive reflection (learning grounded in real
 * execution, enriching Julius), each specialist's contribution count, and links
 * to the relationship graph. Reuses the existing Julius service/registry; it
 * introduces no parallel system.
 *
 * Founder-gated: not a customer surface. It lives under /harmony and is not a
 * customer prefix, so isFounderHarmonyPath keeps it founder-only.
 */
const SECTIONS: { kind: JuliusKind; key: string }[] = [
  { kind: "objective", key: "objectives" },
  { kind: "decision", key: "decisions" },
  { kind: "activity", key: "activities" },
  { kind: "knowledge", key: "knowledge" },
];

export default async function JuliusBrainPage() {
  const t = await getTranslations("julius");
  const locale = await getLocale();
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  const entries = companyId
    ? await listJuliusEntries(user.id, companyId, { limit: 200 })
    : [];

  if (!companyId) {
    return (
      <>
        <PageHeader title={t("title")} description={t("subtitle")} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("noCompany.title")}</CardTitle>
            <CardDescription>{t("noCompany.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/harmony/companies">{t("noCompany.cta")}</Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  const reflection = await buildHarmonyReflection(user.id, companyId);

  const contributions = new Map<string, number>();
  for (const e of entries) {
    contributions.set(e.agent, (contributions.get(e.agent) ?? 0) + 1);
  }

  const JuliusIcon = JULIUS_ICON;

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")}>
        <Button asChild variant="outline" size="sm">
          <Link href="/harmony/workforce">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("backToWorkforce")}
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/harmony/workforce/graph">
            <Network className="size-4" aria-hidden="true" />
            {t("openGraph")}
          </Link>
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-6">
        {/* Julius — the Company Brain, centered. */}
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <span className="inline-flex size-16 items-center justify-center rounded-2xl border border-primary/40 bg-primary/10 text-primary">
              <JuliusIcon className="size-8" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">{JULIUS.name}</h2>
              <p className="text-sm text-muted-foreground">{t("role")}</p>
            </div>
            <Badge variant="secondary">{t("entries", { n: entries.length })}</Badge>
          </CardContent>
        </Card>

        {/* Harmony's reflection — executive learning grounded in real execution. */}
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="min-w-0">
              <CardTitle className="text-base">{t("reflection.title")}</CardTitle>
              <CardDescription>{t("reflection.subtitle")}</CardDescription>
            </div>
            <HarmonyReflectButton />
          </CardHeader>
          <CardContent>
            {!reflection.hasData ? (
              <p className="text-sm text-muted-foreground">{t("reflection.empty")}</p>
            ) : (
              <ul className="space-y-3">
                {reflection.insights.map((ins) => (
                  <li
                    key={`${ins.dimension}-${ins.title}`}
                    className="rounded-lg border p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase tracking-wide"
                      >
                        {t(`reflection.dim.${ins.dimension}`)}
                      </Badge>
                      <span className="text-sm font-medium">{ins.title}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{ins.detail}</p>
                    {ins.examples.length > 0 ? (
                      <ul className="mt-1.5 space-y-0.5">
                        {ins.examples.map((ex, i) => (
                          <li
                            key={i}
                            className="truncate text-xs text-muted-foreground"
                          >
                            · {ex}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Organizational memory, grouped by kind. */}
        <div className="grid gap-4 md:grid-cols-2">
          {SECTIONS.map(({ kind, key }) => {
            const items = entries.filter((e) => e.kind === kind).slice(0, 8);
            return (
              <Card key={kind}>
                <CardHeader>
                  <CardTitle className="text-base">{t(`sections.${key}`)}</CardTitle>
                  <CardDescription>{t(`sectionHint.${key}`)}</CardDescription>
                </CardHeader>
                <CardContent>
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t(`empty.${key}`)}
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {items.map((e) => {
                        const agentLabel = getAiosAgent(e.agent)?.name ?? e.agent;
                        return (
                          <li key={e.id} className="rounded-lg border p-3">
                            <p className="text-sm font-medium">{e.title}</p>
                            {e.content ? (
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                {e.content}
                              </p>
                            ) : null}
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{t("by", { agent: agentLabel })}</span>
                              <span aria-hidden="true">·</span>
                              <span>{formatDate(e.created_at, locale)}</span>
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* The specialist workforce around Julius. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("workforceTitle")}</CardTitle>
            <CardDescription>{t("workforceHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {WORKFORCE_SPECIALISTS.map((a) => {
                const Icon = AGENT_ICONS[a.key];
                const n = contributions.get(a.key) ?? 0;
                return (
                  <Link
                    key={a.key}
                    href={`/harmony/workforce/${a.key}`}
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
                  >
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-foreground">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.role}</p>
                    </div>
                    <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                      {t("contributions", { n })}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
