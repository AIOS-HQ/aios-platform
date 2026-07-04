import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck, AlertTriangle, CheckCircle2, Cpu } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { listConnectorDefinitions } from "@/lib/integrations/registry";
import { isDevConfigured, devConfigurationGaps } from "@/lib/integrations/registry-status";
import { familyRequiredEnv } from "@/lib/integrations/oauth-families";
import { getRedirectUri } from "@/lib/integrations/config";
import { connectGateEnabled } from "@/lib/integrations/connect-gate";
import { hasCapabilityHandler } from "@/lib/integrations/runtime/runtime";
import { ensureProvidersRegistered } from "@/lib/integrations/providers";
import { RuntimeSelfTest } from "@/components/integrations/runtime-self-test";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConnectorGlyph } from "@/components/brand/brand-icons";

export const metadata: Metadata = { title: "Developer Platform · AIOS" };

/**
 * Developer Platform (Layer 1) — read-only connector readiness.
 *
 * Admin-only. Surfaces, for EVERY connector, whether its developer
 * configuration is complete (dev_configured), the exact env vars + redirect URI
 * required, the remaining gaps, and — as of Group B.1 — how many of its
 * capabilities are wired to the Universal Capability Runtime. Presence checks
 * only; no secret values are read or shown.
 */
export default async function DeveloperPlatformPage() {
  await requireUser();
  if (!(await currentUserIsAdmin())) notFound();

  // Register provider capability handlers so runtime wiring is observable here.
  ensureProvidersRegistered();

  const connectors = listConnectorDefinitions();
  const rows = connectors.map((def) => ({
    def,
    ready: isDevConfigured(def),
    gaps: devConfigurationGaps(def),
    requiredEnv:
      def.auth === "oauth2" && def.oauthFamily
        ? familyRequiredEnv(def.oauthFamily)
        : def.requiredEnv,
    redirectUri: def.auth === "oauth2" ? getRedirectUri(def.id) : null,
    runtimeWired: def.capabilities.filter((c) => hasCapabilityHandler(def.id, c.id)).length,
    capabilityCount: def.capabilities.length,
  }));

  const readyCount = rows.filter((r) => r.ready).length;
  const needsSetup = rows.filter((r) => !r.ready);
  const ready = rows.filter((r) => r.ready);

  const wiredConnectors = rows.filter((r) => r.runtimeWired > 0).length;
  const wiredCapabilities = rows.reduce((n, r) => n + r.runtimeWired, 0);

  return (
    <>
      <PageHeader
        title="Developer Platform"
        description="Layer 1 — configure the platform OAuth apps and credentials that back every connector. Customers and founders can only connect a provider once it is fully configured here."
      />

      <div className="flex flex-col gap-6 lg:max-w-4xl">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">
                {readyCount} of {rows.length} connectors are developer-configured.
              </p>
              <p className="text-muted-foreground">
                The Connect button is gated by this readiness for every connector (the
                dev_configured invariant). Connect gate:{" "}
                <span className="font-medium text-foreground">
                  {connectGateEnabled() ? "ENABLED" : "disabled"}
                </span>
                . Only env-var presence is checked here — secret values are never read.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/20">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <Cpu className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">
                Universal Capability Runtime: {wiredCapabilities} capabilities wired across{" "}
                {wiredConnectors} connector{wiredConnectors === 1 ? "" : "s"}.
              </p>
              <p className="text-muted-foreground">
                Wired capabilities execute through the shared runtime (loading, permissions,
                retry, health, telemetry, recovery, audit). Remaining connectors inherit the
                same runtime as their handlers are implemented.
              </p>
              <div className="pt-1">
                <RuntimeSelfTest />
              </div>
            </div>
          </CardContent>
        </Card>

        {needsSetup.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
              Needs developer setup ({needsSetup.length})
            </h2>
            <div className="flex flex-col gap-3">
              {needsSetup.map(({ def, gaps, requiredEnv, redirectUri }) => (
                <Card key={def.id} className="border-warning/30">
                  <CardHeader className="flex-row items-center gap-3 space-y-0">
                    <ConnectorGlyph id={def.id} initials={def.initials} />
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-base">{def.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {def.auth}
                        {def.oauthFamily ? ` · family: ${def.oauthFamily}` : ""}
                        {" · "}
                        {def.layers.founder ? "Founder" : ""}
                        {def.layers.founder && def.layers.customer ? " + " : ""}
                        {def.layers.customer ? "Customer" : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">Not configured</Badge>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    {gaps.length > 0 && (
                      <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                        {gaps.map((g, i) => (
                          <li key={i}>{g}</li>
                        ))}
                      </ul>
                    )}
                    {requiredEnv.length > 0 && (
                      <p className="text-muted-foreground">
                        Required env:{" "}
                        {requiredEnv.map((k) => (
                          <code
                            key={k}
                            className="mr-1 rounded bg-muted px-1 py-0.5 font-mono text-[11px]"
                          >
                            {k}
                          </code>
                        ))}
                      </p>
                    )}
                    {redirectUri && (
                      <p className="break-all text-muted-foreground">
                        Whitelist redirect URI:{" "}
                        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                          {redirectUri}
                        </code>
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {ready.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
              Ready ({ready.length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {ready.map(({ def, redirectUri, runtimeWired, capabilityCount }) => (
                <Card key={def.id}>
                  <CardHeader className="flex-row items-center gap-3 space-y-0">
                    <ConnectorGlyph id={def.id} initials={def.initials} />
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-base">{def.name}</CardTitle>
                      <p className="truncate text-xs text-muted-foreground">
                        {def.oauthFamily ? `family: ${def.oauthFamily}` : def.auth}
                      </p>
                    </div>
                    {runtimeWired > 0 ? (
                      <Badge variant="default" className="shrink-0">
                        Runtime {runtimeWired}/{capabilityCount}
                      </Badge>
                    ) : (
                      <Badge variant="default" className="shrink-0">Ready</Badge>
                    )}
                  </CardHeader>
                  {(redirectUri || runtimeWired > 0) && (
                    <CardContent className="space-y-1 text-xs">
                      {runtimeWired > 0 && (
                        <p className="text-muted-foreground">
                          {runtimeWired} of {capabilityCount} capabilities wired to the runtime.
                        </p>
                      )}
                      {redirectUri && (
                        <p className="break-all text-muted-foreground">
                          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                            {redirectUri}
                          </code>
                        </p>
                      )}
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
