import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Boxes, CheckCircle2, GitBranch, Plug, Sparkles, Target, Users } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { buildWorkerProfile } from "@/lib/workforce/marketplace";
import { loadInstallState } from "@/lib/marketplace/persistence";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MarketplaceActions } from "@/components/marketplace/marketplace-actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  const profile = await buildWorkerProfile(key);
  return { title: profile ? `${profile.name} — AI Worker` : "AI Worker" };
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Users;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon className="size-3.5 text-primary" aria-hidden="true" />
          {title}
        </p>
        {children}
      </CardContent>
    </Card>
  );
}

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <span key={it} className="rounded-md bg-muted px-2 py-1 text-xs text-foreground/90">
          {it}
        </span>
      ))}
    </div>
  );
}

export default async function WorkerDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const t = await getTranslations("marketplace");
  const profile = await buildWorkerProfile(key);
  if (!profile) notFound();

  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();
  let installed = false;
  if (companyId && profile.itemId) {
    const state = await loadInstallState(user.id, companyId);
    installed = Boolean(state[profile.itemId]);
  }

  return (
    <>
      <PageHeader title={profile.name} description={profile.role}>
        <Button asChild variant="outline" size="sm">
          <Link href="/harmony/marketplace">{t("worker.back")}</Link>
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-6">
        {/* Hero: portrait + identity + health + version + install */}
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <span
              className="flex size-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-white"
              style={{ backgroundImage: "linear-gradient(135deg, #2f6bff, #8fd0ff)" }}
              aria-hidden="true"
            >
              {profile.name.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold">{profile.name}</p>
              <p className="text-sm text-muted-foreground">{profile.role}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Badge className="gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-300" aria-hidden="true" />
                  {t("worker.health")}: {profile.health.label}
                </Badge>
                <span className="text-muted-foreground">
                  {t("labels.version")} <span className="font-medium text-foreground">v{profile.version}</span>
                </span>
                <span className="text-muted-foreground">
                  {t("worker.installedCompanies", { count: profile.installedCompanies })}
                </span>
              </div>
            </div>
            <div className="sm:w-56">
              {profile.itemId ? (
                <MarketplaceActions companyId={companyId} itemId={profile.itemId} installed={installed} />
              ) : (
                <p className="text-xs text-muted-foreground">{t("worker.notPublished")}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Mission */}
        <Section icon={Target} title={t("worker.mission")}>
          <p className="text-sm text-muted-foreground">{profile.mission}</p>
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section icon={CheckCircle2} title={t("worker.responsibilities")}>
            <ul className="list-disc pl-4 text-sm text-muted-foreground">
              {profile.responsibilities.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Section>
          <Section icon={Sparkles} title={t("worker.skills")}>
            <Chips items={profile.skills} empty={t("labels.none")} />
          </Section>
          <Section icon={Plug} title={t("worker.connectors")}>
            <Chips items={profile.connectors} empty={t("labels.none")} />
          </Section>
          <Section icon={Users} title={t("worker.departments")}>
            <Chips items={profile.departments} empty={t("labels.none")} />
          </Section>
          <Section icon={GitBranch} title={t("worker.dependencies")}>
            <Chips items={profile.dependencies} empty={t("labels.none")} />
          </Section>
          <Section icon={Target} title={t("worker.roadmap")}>
            <ul className="list-disc pl-4 text-sm text-muted-foreground">
              {profile.roadmap.length > 0 ? (
                profile.roadmap.map((r) => <li key={r}>{r}</li>)
              ) : (
                <li>{t("labels.none")}</li>
              )}
            </ul>
          </Section>
        </div>

        {/* Changelog */}
        <Section icon={Boxes} title={t("worker.changelog")}>
          <ul className="list-disc pl-4 text-sm text-muted-foreground">
            {profile.changelog.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
