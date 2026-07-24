export type MasonProtectedResourceKind =
  | "authentication"
  | "approvals"
  | "billing"
  | "payments"
  | "migrations"
  | "github_workflows"
  | "infrastructure"
  | "runtime_policies"
  | "environment_handling";

export interface MasonProtectedResource {
  kind: MasonProtectedResourceKind;
  path: string;
  approvalLevel: "founder";
  reason: string;
}

const PROTECTED_PATH_RULES: ReadonlyArray<{
  kind: MasonProtectedResourceKind;
  matches: (path: string) => boolean;
  reason: string;
}> = [
  { kind: "authentication", matches: (p) => p.startsWith("src/lib/auth/") || p.startsWith("src/lib/supabase/") || p.includes("/(auth)/") || p.startsWith("src/app/auth/") || p === "src/middleware.ts", reason: "Authentication controls identity and session boundaries." },
  { kind: "approvals", matches: (p) => p.includes("/approval") || p.includes("/autonomy/"), reason: "Approval and autonomy code governs Founder authorization." },
  { kind: "billing", matches: (p) => p.includes("/billing/") || p.includes("subscription"), reason: "Billing changes can affect commercial access." },
  { kind: "payments", matches: (p) => p.includes("/payments/") || p.includes("stripe"), reason: "Payment changes can move or expose funds." },
  { kind: "migrations", matches: (p) => p.startsWith("supabase/migrations/") || p.endsWith(".sql"), reason: "Database migrations change persistent state and policy." },
  { kind: "github_workflows", matches: (p) => p.startsWith(".github/workflows/"), reason: "GitHub workflows execute trusted automation." },
  { kind: "infrastructure", matches: (p) => /^(infra|infrastructure|azure|terraform|deploy|docker)\//.test(p) || /(^|\/)(Dockerfile|docker-compose|vercel\.json)$/.test(p) || p === "next.config.ts", reason: "Infrastructure changes affect deployed runtime boundaries." },
  { kind: "runtime_policies", matches: (p) => p.includes("/policy") || p.includes("runtime-state") || p.includes("runtime-policy"), reason: "Runtime policy changes alter execution governance." },
  { kind: "environment_handling", matches: (p) => p.startsWith(".env") || p.includes("/env/") || p.endsWith("env.ts") || p.endsWith("env.mjs"), reason: "Environment handling can expose or redirect credentials and runtimes." },
] as const;

function normalizeRepositoryPath(path: string): string {
  return path.trim().replace(/^\.\//, "").replaceAll("\\", "/");
}

export function classifyMasonProtectedPaths(paths: readonly string[]): MasonProtectedResource[] {
  const resources = new Map<string, MasonProtectedResource>();
  for (const rawPath of paths) {
    const path = normalizeRepositoryPath(rawPath);
    if (!path || path.startsWith("/") || path.split("/").includes("..")) continue;
    for (const rule of PROTECTED_PATH_RULES) {
      if (!rule.matches(path)) continue;
      const key = `${rule.kind}:${path}`;
      resources.set(key, {
        kind: rule.kind,
        path,
        approvalLevel: "founder",
        reason: rule.reason,
      });
    }
  }
  return [...resources.values()].sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
}

export function protectedPathApprovalRequired(resources: readonly MasonProtectedResource[]): boolean {
  return resources.length > 0;
}
