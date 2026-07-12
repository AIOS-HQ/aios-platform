"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import type { LinkedInPublisherHealth } from "@/lib/integrations/linkedin-publisher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type HealthResponse = LinkedInPublisherHealth & { checkedAt?: string };

function isHealthResponse(value: unknown): value is HealthResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Partial<HealthResponse>).provider === "linkedin" &&
      (value as Partial<HealthResponse>).mode === "organization_publisher",
  );
}

function statusVariant(ok: boolean, configured: boolean): "success" | "warning" | "destructive" {
  if (ok) return "success";
  return configured ? "warning" : "destructive";
}

function statusLabel(ok: boolean, configured: boolean): string {
  if (ok) return "Connected";
  return configured ? "Invalid" : "Missing";
}

function formatDate(value?: string | null): string {
  if (!value) return "Not reported";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not reported";
  return date.toLocaleString();
}

function Icon({ health }: { health: HealthResponse | null }) {
  if (!health) return <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />;
  if (health.healthy) return <CheckCircle2 className="size-4 text-success" aria-hidden="true" />;
  if (health.publisherConfigured) return <AlertTriangle className="size-4 text-warning" aria-hidden="true" />;
  return <XCircle className="size-4 text-destructive" aria-hidden="true" />;
}

export function LinkedInPublisherCard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/linkedin/publisher-health", {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const json = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !isHealthResponse(json)) {
        setError("Health check failed.");
        return;
      }
      setHealth(json);
    } catch {
      setError("Health check failed.");
    } finally {
      setLoading(false);
    }
  }

  const publisherConfigured = health?.publisherConfigured ?? false;
  const signInConfigured = health?.signInConfigured ?? false;
  const publisherOk = Boolean(health?.healthy);
  const tokenValid = Boolean(health?.token.valid);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon health={health} />
          LinkedIn Publisher
        </CardTitle>
        <CardDescription>
          Separate from LinkedIn Sign-In. Uses the approved AIOS Publisher app for organization posts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Publisher App</p>
            <Badge className="mt-2" variant={statusVariant(publisherOk, publisherConfigured)}>
              {statusLabel(publisherOk, publisherConfigured)}
            </Badge>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Sign-In App</p>
            <Badge className="mt-2" variant={signInConfigured ? "success" : "destructive"}>
              {signInConfigured ? "Configured" : "Missing"}
            </Badge>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Publishing identity</p>
            <p className="mt-2 break-all text-sm font-medium">
              {health?.organization.name ?? health?.organization.urn ?? "Run health check"}
            </p>
            {health?.organization.urn ? (
              <p className="mt-1 break-all text-xs text-muted-foreground">{health.organization.urn}</p>
            ) : null}
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Token</p>
            <Badge className="mt-2" variant={tokenValid ? "success" : publisherConfigured ? "warning" : "destructive"}>
              {tokenValid ? "Valid" : publisherConfigured ? "Invalid" : "Missing"}
            </Badge>
            <p className="mt-2 text-xs text-muted-foreground">
              Expires: {formatDate(health?.token.expiresAt)}
            </p>
          </div>
        </div>

        <div className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Permissions</p>
            <p className="mt-1">
              Organization publishing: {health?.permissions.organizationPublish ? "yes" : "no"}
            </p>
            <p>Organization read: {health?.permissions.organizationRead ? "yes" : "no"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Capabilities</p>
            <p className="mt-1">Text post: {health?.capabilities.textPost ? "available" : "unavailable"}</p>
            <p>Document carousel: {health?.capabilities.documentCarousel ? "available" : "unavailable"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">API version</p>
            <p className="mt-1">{health?.apiVersion ?? "202604"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Last checked</p>
            <p className="mt-1">{formatDate(health?.checkedAt)}</p>
          </div>
        </div>

        {health?.issues.length ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {health.issues.map((issue) => (
              <p key={`${issue.code}-${issue.message}`}>{issue.message}</p>
            ))}
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="button" onClick={runCheck} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Run health check
        </Button>
      </CardContent>
    </Card>
  );
}
