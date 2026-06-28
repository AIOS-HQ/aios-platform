"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Check, ExternalLink } from "lucide-react";
import { HarmonyAvatar } from "@/components/brand/harmony-logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getConnector } from "@/lib/integrations/connectors";
import {
  BUSINESS_TYPES,
  recommendConnectors,
  groupRecommendations,
  type BusinessProfile,
  type BusinessType,
  type ContactChannel,
} from "@/lib/integrations/onboarding";
import { saveOnboardingProfile } from "@/lib/integrations/onboarding-actions";

type Step = "welcome" | "business" | "recommend" | "review" | "done";
const STEPS: Step[] = ["welcome", "business", "recommend", "review", "done"];

const CHANNELS: ContactChannel[] = ["whatsapp", "email", "phone", "web_chat", "social"];
const EMPLOYEE_BUCKETS = ["1", "2-10", "11-50", "50+"];
const LANGS = ["en", "es"];
const AIS = ["openai", "anthropic", "gemini"];

/**
 * Harmony Guided Onboarding — a conversational, non-technical setup where
 * Harmony acts like a human implementation specialist learning the business and
 * recommending what to connect. It never asks for technical configuration:
 * recommendations come from the customer's answers and connecting is one-click
 * OAuth (or "available soon" until a connector is wired). Reuses the connector
 * registry + the existing OAuth connect route — no duplicate connection flow.
 */
export function GuidedOnboarding({ connectedIds }: { connectedIds: string[] }) {
  const t = useTranslations("onboarding");
  const [, startSave] = useTransition();
  const [step, setStep] = useState<Step>("welcome");
  const [profile, setProfile] = useState<BusinessProfile>({
    businessType: "other",
    contactChannels: [],
    usesCrm: false,
    acceptsPayments: false,
    hasDevices: false,
    languages: ["en"],
    aiProviders: [],
  });

  const connected = useMemo(() => new Set(connectedIds), [connectedIds]);
  const recommended = useMemo(() => recommendConnectors(profile), [profile]);
  const groups = useMemo(() => groupRecommendations(recommended), [recommended]);

  const idx = STEPS.indexOf(step);
  function goNext() {
    if (step === "business") {
      // Persist the profile to Julius (best-effort) so Harmony knows the business.
      startSave(() => {
        void saveOnboardingProfile(profile);
      });
    }
    setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
  }
  function goBack() {
    setStep(STEPS[Math.max(idx - 1, 0)]);
  }

  const toggle = <T,>(arr: T[], v: T) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  function Chip({
    active,
    onClick,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) {
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "rounded-full border px-3 py-1.5 text-sm transition-colors",
          active
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border text-muted-foreground hover:bg-accent",
        )}
      >
        {children}
      </button>
    );
  }

  function ConnectorTile({ id }: { id: string }) {
    const c = getConnector(id);
    if (!c) return null;
    const isConnected = connected.has(id);
    const canConnect = Boolean(c.authorizable) && !isConnected;
    return (
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-xs font-semibold">
          {c.initials}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
        {isConnected ? (
          <Badge className="shrink-0">
            <Check className="size-3" aria-hidden="true" />
            {t("status.connected")}
          </Badge>
        ) : canConnect ? (
          <Button asChild size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs">
            <a href={`/api/integrations/${id}/connect`} target="_blank" rel="noopener noreferrer">
              {t("connect")}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </Button>
        ) : (
          <Badge variant="outline" className="shrink-0">
            {t("status.comingSoon")}
          </Badge>
        )}
      </div>
    );
  }

  function renderGroup(titleKey: string, ids: string[]) {
    if (ids.length === 0) return null;
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t(`group.${titleKey}`)}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {ids.map((id) => (
            <ConnectorTile key={id} id={id} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      {/* Harmony, speaking. */}
      <div className="flex items-center gap-3">
        <HarmonyAvatar className="size-9" title="Harmony" />
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">
            {t("progress", { n: idx + 1, total: STEPS.length })}
          </p>
          <div className="mt-1 flex gap-1" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  i <= idx ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        {step === "welcome" && (
          <div className="space-y-3">
            <h1 className="text-xl font-semibold">{t("welcome.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("welcome.body")}</p>
          </div>
        )}

        {step === "business" && (
          <div className="space-y-5">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{t("business.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("business.body")}</p>
            </div>

            <Field label={t("business.q.type")}>
              <div className="flex flex-wrap gap-2">
                {BUSINESS_TYPES.map((bt) => (
                  <Chip
                    key={bt}
                    active={profile.businessType === bt}
                    onClick={() => setProfile((p) => ({ ...p, businessType: bt as BusinessType }))}
                  >
                    {t(`businessType.${bt}`)}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label={t("business.q.employees")}>
              <div className="flex flex-wrap gap-2">
                {EMPLOYEE_BUCKETS.map((b) => (
                  <Chip
                    key={b}
                    active={profile.employees === b}
                    onClick={() => setProfile((p) => ({ ...p, employees: b }))}
                  >
                    {b}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label={t("business.q.channels")}>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((ch) => (
                  <Chip
                    key={ch}
                    active={profile.contactChannels.includes(ch)}
                    onClick={() =>
                      setProfile((p) => ({ ...p, contactChannels: toggle(p.contactChannels, ch) }))
                    }
                  >
                    {t(`channel.${ch}`)}
                  </Chip>
                ))}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <YesNo
                label={t("business.q.crm")}
                value={profile.usesCrm}
                onChange={(v) => setProfile((p) => ({ ...p, usesCrm: v }))}
                t={t}
              />
              <YesNo
                label={t("business.q.payments")}
                value={profile.acceptsPayments}
                onChange={(v) => setProfile((p) => ({ ...p, acceptsPayments: v }))}
                t={t}
              />
              <YesNo
                label={t("business.q.devices")}
                value={profile.hasDevices}
                onChange={(v) => setProfile((p) => ({ ...p, hasDevices: v }))}
                t={t}
              />
            </div>

            <Field label={t("business.q.languages")}>
              <div className="flex flex-wrap gap-2">
                {LANGS.map((l) => (
                  <Chip
                    key={l}
                    active={profile.languages.includes(l)}
                    onClick={() => setProfile((p) => ({ ...p, languages: toggle(p.languages, l) }))}
                  >
                    {t(`language.${l}`)}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label={t("business.q.ai")}>
              <div className="flex flex-wrap gap-2">
                {AIS.map((a) => (
                  <Chip
                    key={a}
                    active={profile.aiProviders.includes(a)}
                    onClick={() => setProfile((p) => ({ ...p, aiProviders: toggle(p.aiProviders, a) }))}
                  >
                    {getConnector(a)?.name ?? a}
                  </Chip>
                ))}
              </div>
            </Field>
          </div>
        )}

        {step === "recommend" && (
          <div className="space-y-5">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{t("recommend.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("recommend.body")}</p>
            </div>
            {recommended.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("recommend.empty")}</p>
            ) : (
              <div className="space-y-4">
                {renderGroup("communication", groups.communication)}
                {renderGroup("business", groups.business)}
                {renderGroup("calendar", groups.calendar)}
                {renderGroup("device", groups.device)}
                {renderGroup("ai", groups.ai)}
              </div>
            )}
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{t("review.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("review.body")}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {recommended.map((id) => (
                <ConnectorTile key={id} id={id} />
              ))}
            </div>
            <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
              {t("review.permissions")}
            </p>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
              <HarmonyAvatar className="size-8" title="Harmony" />
            </span>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{t("done.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("done.body")}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/harmony/operator">{t("done.openHarmony")}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/harmony/integrations">{t("done.openIntegrations")}</Link>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Footer navigation */}
      {step !== "done" && (
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={idx === 0}
            className={cn(idx === 0 && "invisible")}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("back")}
          </Button>
          <Button onClick={goNext}>
            {step === "welcome" ? t("welcome.cta") : step === "review" ? t("finish") : t("next")}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {children}
    </div>
  );
}

function YesNo({
  label,
  value,
  onChange,
  t,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex gap-2">
        <button
          type="button"
          aria-pressed={value}
          onClick={() => onChange(true)}
          className={cn(
            "flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors",
            value ? "border-primary bg-primary/10" : "text-muted-foreground hover:bg-accent",
          )}
        >
          {t("yes")}
        </button>
        <button
          type="button"
          aria-pressed={!value}
          onClick={() => onChange(false)}
          className={cn(
            "flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors",
            !value ? "border-primary bg-primary/10" : "text-muted-foreground hover:bg-accent",
          )}
        >
          {t("no")}
        </button>
      </div>
    </div>
  );
}
