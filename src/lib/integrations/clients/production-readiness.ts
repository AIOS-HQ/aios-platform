import "server-only";

import { getConnections } from "@/lib/integrations/connections";
import { isTokenEncryptionEnabled } from "@/lib/crypto/tokens";
import { PRODUCTION_REQUIRED_ENV } from "@/lib/env.server";
import { runSupabaseManagementQuery } from "@/lib/integrations/clients/supabase-diagnostics";
import { getCanonicalVercelDeploymentStatus } from "@/lib/integrations/clients/vercel";

export type ReadinessStatus = "ok" | "warn";
export type ReadinessSeverity = "blocking" | "warning" | "info";

export interface ReadinessItem {
  id: string;
  ok: boolean;
  severity: ReadinessSeverity;
  detail: string;
}

export interface ReadinessSection {
  id: string;
  status: ReadinessStatus;
  items: ReadinessItem[];
}

export interface ProductionReadinessResult {
  status: ReadinessStatus;
  sections: ReadinessSection[];
}

const EXPECTED_MIGRATIONS = [
  "20260601000000",
  "20260601000100",
  "20260601000600",
  "20260601000700",
  "20260601000800",
  "20260601000900",
  "20260601001000",
  "20260601001100",
  "20260602000000",
  "20260603000000",
  "20260604000000",
  "20260605000000",
  "20260606000000",
  "20260607000000",
  "20260608000000",
  "20260615000100",
  "20260616140000",
  "20260617120000",
  "20260624000000",
  "20260624010000",
  "20260624020000",
  "20260624030000",
  "20260624040000",
  "20260624050000",
  "20260624060000",
  "20260624070000",
  "20260625000000",
] as const;

const REQUIRED_TABLES = [
  "profiles",
  "user_settings",
  "personal_tasks",
  "personal_goals",
  "personal_notes",
  "personal_brains",
  "companies",
  "departments",
  "agents",
  "objectives",
  "projects",
  "work_items",
  "approvals",
  "activity_events",
  "channels",
  "conversations",
  "messages",
  "content_items",
  "billing_customers",
  "subscriptions",
  "integration_connections",
  "memories",
  "agent_actions",
  "learning_settings",
  "julius_entries",
  "agent_messages",
  "ops_events",
  "agent_chat_messages",
  "agent_objectives",
  "agent_work_queue",
  "agent_recommendations",
  "agent_autonomy_global",
  "agent_autonomy_settings",
  "agent_autonomy_categories",
  "agent_autonomy_audit",
] as const;

const REQUIRED_COLUMNS = [
  "profiles.role",
  "companies.domain",
  "approvals.agent_message_id",
  "integration_connections.access_token",
  "integration_connections.refresh_token",
  "learning_settings.require_approval",
  "julius_entries.embedding",
  "memories.company_id",
  "memories.embedding",
  "agent_work_queue.risk_level",
  "agent_work_queue.category",
] as const;

const REQUIRED_FUNCTIONS = [
  "set_updated_at",
  "handle_new_user",
  "prevent_role_escalation",
  "is_admin",
  "match_julius_entries",
] as const;

const REQUIRED_INDEXES = [
  "julius_entries_company_idx",
  "julius_entries_recent_idx",
  "julius_entries_embedding_idx",
  "memories_embedding_idx",
  "agent_autonomy_audit_owner_idx",
] as const;

const REQUIRED_ENV = [
  "NEXT_PUBLIC_APP_URL",
  ...PRODUCTION_REQUIRED_ENV,
] as const;

const OPTIONAL_INTEGRATION_ENV = [
  "GITHUB_OAUTH_CLIENT_ID",
  "GITHUB_OAUTH_CLIENT_SECRET",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "LINKEDIN_PUBLISHER_ACCESS_TOKEN",
  "X_OAUTH_CLIENT_ID",
  "X_OAUTH_CLIENT_SECRET",
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
  "VERCEL_TOKEN",
  "VERCEL_TEAM_ID",
  "VERCEL_PROJECT_ID",
] as const;

function present(name: string): boolean {
  return Boolean(process.env[name]);
}

function supabasePublicKeyPresent(): boolean {
  return present("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || present("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

function googleOAuthPresent(): boolean {
  return (
    (present("GOOGLE_CLIENT_ID") && present("GOOGLE_CLIENT_SECRET")) ||
    (present("GOOGLE_OAUTH_CLIENT_ID") && present("GOOGLE_OAUTH_CLIENT_SECRET"))
  );
}

function linkedInPublisherPresent(): boolean {
  return (
    present("LINKEDIN_PUBLISHER_ACCESS_TOKEN") &&
    (present("LINKEDIN_ORGANIZATION_URN") || present("LINKEDIN_ORGANIZATION_ID"))
  );
}

function xOAuthPresent(): boolean {
  return present("X_OAUTH_CLIENT_ID") && present("X_OAUTH_CLIENT_SECRET");
}

function summarizeMissing(missing: readonly string[]): string {
  if (missing.length === 0) return "present";
  if (missing.length <= 6) return `missing: ${missing.join(", ")}`;
  return `missing ${missing.length}: ${missing.slice(0, 6).join(", ")}...`;
}

function section(id: string, items: ReadinessItem[]): ReadinessSection {
  return {
    id,
    status: items.every((i) => i.ok || i.severity === "info") ? "ok" : "warn",
    items,
  };
}

function hasBlockingFailure(section: ReadinessSection): boolean {
  return section.items.some((item) => !item.ok && item.severity === "blocking");
}

async function databaseSection(secret: {
  accessToken: string;
  externalAccount: string | null;
} | null): Promise<ReadinessSection> {
  if (!secret?.externalAccount) {
    return section("database", [
      {
        id: "database_connection",
        ok: false,
        severity: "blocking",
        detail: "connect Supabase diagnostics to verify production database foundation",
      },
    ]);
  }

  const ref = secret.externalAccount;
  const token = secret.accessToken;
  const [migrations, tables, columns, functions, indexes, rls] = await Promise.all([
    runSupabaseManagementQuery(ref, token, "select version from supabase_migrations.schema_migrations;"),
    runSupabaseManagementQuery(ref, token, "select table_name from information_schema.tables where table_schema = 'public';"),
    runSupabaseManagementQuery(
      ref,
      token,
      "select table_name, column_name from information_schema.columns where table_schema = 'public';",
    ),
    runSupabaseManagementQuery(ref, token, "select routine_name from information_schema.routines where routine_schema = 'public';"),
    runSupabaseManagementQuery(ref, token, "select indexname from pg_indexes where schemaname = 'public';"),
    runSupabaseManagementQuery(
      ref,
      token,
      "select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r';",
    ),
  ]);

  const items: ReadinessItem[] = [];

  if (Array.isArray(migrations)) {
    const found = new Set(migrations.map((r) => String((r as { version?: string }).version ?? "")));
    const missing = EXPECTED_MIGRATIONS.filter((v) => !found.has(v));
    items.push({ id: "database_migrations", ok: missing.length === 0, severity: "blocking", detail: summarizeMissing(missing) });
  } else {
    items.push({ id: "database_migrations", ok: false, severity: "blocking", detail: "unavailable" });
  }

  if (Array.isArray(tables)) {
    const found = new Set(tables.map((r) => String((r as { table_name?: string }).table_name ?? "")));
    const missing = REQUIRED_TABLES.filter((t) => !found.has(t));
    items.push({ id: "database_tables", ok: missing.length === 0, severity: "blocking", detail: summarizeMissing(missing) });
  } else {
    items.push({ id: "database_tables", ok: false, severity: "blocking", detail: "unavailable" });
  }

  if (Array.isArray(columns)) {
    const found = new Set(
      columns.map((r) => {
        const row = r as { table_name?: string; column_name?: string };
        return `${row.table_name ?? ""}.${row.column_name ?? ""}`;
      }),
    );
    const missing = REQUIRED_COLUMNS.filter((c) => !found.has(c));
    items.push({ id: "database_columns", ok: missing.length === 0, severity: "blocking", detail: summarizeMissing(missing) });
  } else {
    items.push({ id: "database_columns", ok: false, severity: "blocking", detail: "unavailable" });
  }

  if (Array.isArray(functions)) {
    const found = new Set(functions.map((r) => String((r as { routine_name?: string }).routine_name ?? "")));
    const missing = REQUIRED_FUNCTIONS.filter((f) => !found.has(f));
    items.push({ id: "database_functions", ok: missing.length === 0, severity: "blocking", detail: summarizeMissing(missing) });
  } else {
    items.push({ id: "database_functions", ok: false, severity: "blocking", detail: "unavailable" });
  }

  if (Array.isArray(indexes)) {
    const found = new Set(indexes.map((r) => String((r as { indexname?: string }).indexname ?? "")));
    const missing = REQUIRED_INDEXES.filter((i) => !found.has(i));
    items.push({ id: "database_indexes", ok: missing.length === 0, severity: "warning", detail: summarizeMissing(missing) });
  } else {
    items.push({ id: "database_indexes", ok: false, severity: "warning", detail: "unavailable" });
  }

  if (Array.isArray(rls)) {
    const without = rls.filter((r) => !(r as { relrowsecurity?: boolean }).relrowsecurity).length;
    items.push({
      id: "database_rls",
      ok: without === 0,
      severity: "blocking",
      detail: without === 0 ? "enabled on public tables" : `${without} table(s) without RLS`,
    });
  } else {
    items.push({ id: "database_rls", ok: false, severity: "blocking", detail: "unavailable" });
  }

  return section("database", items);
}

function environmentSection(): ReadinessSection {
  const missing = REQUIRED_ENV.filter((name) => !present(name));
  const keyOk = supabasePublicKeyPresent();
  return section("environment", [
    {
      id: "environment_required",
      ok: missing.length === 0 && keyOk,
      severity: "blocking",
      detail:
        missing.length === 0 && keyOk
          ? "required variables present"
          : summarizeMissing([
              ...missing,
              ...(keyOk ? [] : ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY"]),
            ]),
    },
    {
      id: "environment_token_encryption",
      ok: isTokenEncryptionEnabled(),
      severity: "blocking",
      detail: isTokenEncryptionEnabled() ? "present" : "TOKEN_ENCRYPTION_KEY missing",
    },
  ]);
}

function aiCoreSection(): ReadinessSection {
  return section("ai_core", [
    {
      id: "core_harmony",
      ok: present("NEXT_PUBLIC_SUPABASE_URL") && supabasePublicKeyPresent(),
      severity: "blocking",
      detail: "requires Supabase public env and authenticated app shell",
    },
    {
      id: "core_julius",
      ok: present("NEXT_PUBLIC_SUPABASE_URL") && supabasePublicKeyPresent(),
      severity: "blocking",
      detail: "requires Julius tables verified in database foundation",
    },
    {
      id: "core_auditor",
      ok: present("NEXT_PUBLIC_SUPABASE_URL") && supabasePublicKeyPresent(),
      severity: "blocking",
      detail: "requires agent_actions and approvals verified in database foundation",
    },
    {
      id: "core_workforce",
      ok: present("NEXT_PUBLIC_SUPABASE_URL") && supabasePublicKeyPresent(),
      severity: "blocking",
      detail: "requires registry, autonomy, approvals, Julius, memory, and connector prerequisites",
    },
    {
      id: "core_memory",
      ok: present("NEXT_PUBLIC_SUPABASE_URL") && supabasePublicKeyPresent(),
      severity: "blocking",
      detail: "requires memories and learning_settings verified in database foundation",
    },
    {
      id: "core_approvals",
      ok: present("NEXT_PUBLIC_SUPABASE_URL") && supabasePublicKeyPresent(),
      severity: "blocking",
      detail: "requires approvals and agent_actions verified in database foundation",
    },
    {
      id: "core_connector_runtime",
      ok:
        present("NEXT_PUBLIC_SUPABASE_URL") &&
        supabasePublicKeyPresent() &&
        present("SUPABASE_SERVICE_ROLE_KEY") &&
        isTokenEncryptionEnabled(),
      severity: "blocking",
      detail: "requires integration_connections and token encryption",
    },
  ]);
}

async function integrationsSection(userId: string): Promise<ReadinessSection> {
  const [connections, vercelDeployment] = await Promise.all([
    getConnections(userId),
    getCanonicalVercelDeploymentStatus(userId, {
      repo: process.env.HARMONY_DEFAULT_GITHUB_REPO ?? process.env.GITHUB_DEFAULT_REPO ?? "AIOS-HQ/aios-platform",
      environment: "production",
      requestedGitSha:
        process.env.VERCEL_GIT_COMMIT_SHA ??
        process.env.GIT_COMMIT_SHA ??
        process.env.NEXT_PUBLIC_GIT_SHA ??
        null,
    }),
  ]);
  const connected = new Set(connections.filter((c) => c.status === "connected").map((c) => c.provider));
  const optionalMissing = OPTIONAL_INTEGRATION_ENV.filter((name) => !present(name));
  return section("integrations", [
    {
      id: "integration_supabase",
      ok: connected.has("supabase"),
      severity: "warning",
      detail: connected.has("supabase") ? "diagnostics connected" : "diagnostics token not connected",
    },
    {
      id: "integration_github",
      ok: present("GITHUB_OAUTH_CLIENT_ID") && present("GITHUB_OAUTH_CLIENT_SECRET"),
      severity: "warning",
      detail: present("GITHUB_OAUTH_CLIENT_ID") && present("GITHUB_OAUTH_CLIENT_SECRET") ? "configured" : "missing OAuth env",
    },
    {
      id: "integration_openai",
      ok: present("OPENAI_API_KEY"),
      severity: "warning",
      detail: present("OPENAI_API_KEY") ? "configured" : "missing OPENAI_API_KEY",
    },
    {
      id: "integration_vercel",
      ok: vercelDeployment.status === "healthy",
      severity: "warning",
      detail: `${vercelDeployment.status} via ${vercelDeployment.evidenceTier}`,
    },
    {
      id: "integration_stripe",
      ok: present("STRIPE_SECRET_KEY") && present("STRIPE_WEBHOOK_SECRET"),
      severity: "warning",
      detail: present("STRIPE_SECRET_KEY") && present("STRIPE_WEBHOOK_SECRET") ? "configured" : "missing Stripe env",
    },
    {
      id: "integration_email",
      ok: googleOAuthPresent(),
      severity: "warning",
      detail: googleOAuthPresent() ? "Google email provider configured" : "Google OAuth env missing",
    },
    {
      id: "integration_youtube_foundation",
      ok: googleOAuthPresent(),
      severity: "warning",
      detail: googleOAuthPresent()
        ? "Google OAuth configured for YouTube channel discovery and production publishing scopes"
        : "missing Google OAuth env for YouTube production publishing",
    },
    {
      id: "integration_linkedin_publisher",
      ok: linkedInPublisherPresent(),
      severity: "warning",
      detail: linkedInPublisherPresent()
        ? "LinkedIn publisher token and approved organization configured"
        : "missing LINKEDIN_PUBLISHER_ACCESS_TOKEN and LINKEDIN_ORGANIZATION_URN or LINKEDIN_ORGANIZATION_ID",
    },
    {
      id: "integration_x_publisher",
      ok: xOAuthPresent(),
      severity: "warning",
      detail: xOAuthPresent() ? "X OAuth publisher configured" : "missing X_OAUTH_CLIENT_ID and X_OAUTH_CLIENT_SECRET",
    },
    {
      id: "integration_other",
      ok: optionalMissing.length < OPTIONAL_INTEGRATION_ENV.length,
      severity: "info",
      detail: optionalMissing.length === 0 ? "all optional integration env present" : `${optionalMissing.length} optional integration env var(s) missing`,
    },
  ]);
}

function securitySection(): ReadinessSection {
  const items: ReadinessItem[] = [
    {
      id: "security_admin_gate",
      ok: present("AIOS_ADMIN_EMAILS"),
      severity: "blocking",
      detail: present("AIOS_ADMIN_EMAILS") ? "admin allowlist present" : "AIOS_ADMIN_EMAILS missing",
    },
    {
      id: "security_token_encryption",
      ok: isTokenEncryptionEnabled(),
      severity: "blocking",
      detail: isTokenEncryptionEnabled() ? "enabled" : "TOKEN_ENCRYPTION_KEY missing",
    },
    {
      id: "security_csp",
      ok: (process.env.CSP_MODE ?? "report-only") === "enforce",
      severity: "warning",
      detail: `CSP_MODE=${process.env.CSP_MODE ?? "report-only"}`,
    },
  ];
  return section("security", items);
}

export async function runProductionReadiness(
  userId: string,
  supabaseSecret: { accessToken: string; externalAccount: string | null } | null,
): Promise<ProductionReadinessResult> {
  const sections = await Promise.all([
    databaseSection(supabaseSecret),
    Promise.resolve(environmentSection()),
    Promise.resolve(aiCoreSection()),
    integrationsSection(userId),
    Promise.resolve(securitySection()),
  ]);

  return {
    status: sections.some(hasBlockingFailure) ? "warn" : "ok",
    sections,
  };
}
