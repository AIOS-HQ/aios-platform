import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  getAiosAgent,
  getAgentConnectors,
  isFounderOnlyAgent,
} from "@/lib/workforce/registry";

/**
 * AI Workforce Marketplace — per-worker profile builder (server-only).
 *
 * Composes the code source of truth (the AIOS Workforce Registry: role, mission,
 * responsibilities, connectors) with a small per-worker enrichment (skills,
 * departments, roadmap) and the seeded marketplace item (version, changelog,
 * installed-company count via `company_installations`). Founder-only workers
 * (Mason) are never surfaced. Read-only + owner-scoped through RLS; degrades to
 * registry-only data if the marketplace rows are absent.
 */

interface WorkerEnrichment {
  skills: string[];
  departments: string[];
  roadmap: string[];
}

const WORKER_ENRICHMENT: Record<string, WorkerEnrichment> = {
  harmony: {
    skills: ["Task routing", "Prioritization", "Delegation"],
    departments: ["Executive", "All departments"],
    roadmap: ["Multi-company coordination", "Proactive founder briefings"],
  },
  auditor: {
    skills: ["Code audit", "Deployment validation", "Security checks"],
    departments: ["Engineering", "Compliance"],
    roadmap: ["Continuous audit scoring", "Auto-remediation suggestions"],
  },
  catalyst: {
    skills: ["Content drafting", "Campaign planning", "SEO audit"],
    departments: ["Marketing", "Growth"],
    roadmap: ["Channel auto-publishing", "A/B experiment engine"],
  },
  ambassador: {
    skills: ["Lead qualification", "Conversation triage", "Follow-up"],
    departments: ["Support", "Sales"],
    roadmap: ["Voice channel", "Sentiment-based routing"],
  },
  atlas: {
    skills: ["Documentation", "Knowledge management", "Decision history"],
    departments: ["Operations", "Knowledge"],
    roadmap: ["Semantic recall", "Relationship intelligence"],
  },
  pulse: {
    skills: ["Monitoring", "Alerting", "Usage analytics"],
    departments: ["Operations", "Engineering"],
    roadmap: ["Predictive alerts", "Anomaly detection"],
  },
  horizon: {
    skills: ["Roadmapping", "Scenario analysis", "Goal tracking"],
    departments: ["Executive", "Strategy"],
    roadmap: ["Forecast simulation", "Strategic what-ifs"],
  },
  aegis: {
    skills: ["Risk monitoring", "Permission review", "Threat detection"],
    departments: ["Security", "Compliance"],
    roadmap: ["Threat-intel feeds", "Auto-policy enforcement"],
  },
  ledger: {
    skills: ["Approval records", "Audit trails", "Compliance tracking"],
    departments: ["Finance", "Compliance"],
    roadmap: ["Investor reporting", "Cash forecasting"],
  },
};

const DEFAULT_ENRICHMENT: WorkerEnrichment = {
  skills: [],
  departments: ["Cross-functional"],
  roadmap: [],
};

export interface WorkerProfile {
  key: string;
  name: string;
  role: string;
  mission: string;
  responsibilities: string[];
  skills: string[];
  connectors: string[];
  departments: string[];
  health: { status: "operational" | "unknown"; label: string };
  version: string;
  changelog: string[];
  dependencies: string[];
  installedCompanies: number;
  roadmap: string[];
  itemSlug: string;
  itemId: string | null;
}

/** Build a full marketplace profile for an AI worker, or null if not surfaced. */
export async function buildWorkerProfile(key: string): Promise<WorkerProfile | null> {
  const agent = getAiosAgent(key);
  if (!agent || isFounderOnlyAgent(key)) return null;

  const enrichment = WORKER_ENRICHMENT[key] ?? DEFAULT_ENRICHMENT;
  const itemSlug = `worker-${key}`;

  let version = "1.0.0";
  let changelog: string[] = ["Initial release"];
  let dependencies: string[] = [];
  let installedCompanies = 0;
  let resolvedItemId: string | null = null;

  try {
    const supabase = await createClient();
    const { data: item } = await supabase
      .from("marketplace_items")
      .select("id")
      .eq("slug", itemSlug)
      .eq("visibility", "marketplace_public")
      .maybeSingle();
    const itemId = (item as { id: string } | null)?.id;
    if (itemId) {
      resolvedItemId = itemId;
      const [{ data: versions }, { count }] = await Promise.all([
        supabase
          .from("marketplace_item_versions")
          .select("version, changelog, dependencies")
          .eq("item_id", itemId)
          .order("created_at", { ascending: false }),
        supabase
          .from("company_installations")
          .select("id", { count: "exact", head: true })
          .eq("item_id", itemId),
      ]);
      const vrows = (versions as { version: string; changelog: string | null; dependencies: unknown }[] | null) ?? [];
      if (vrows.length > 0) {
        version = vrows[0].version;
        changelog = vrows.map((v) => `v${v.version}${v.changelog ? ` — ${v.changelog}` : ""}`);
        const deps = vrows[0].dependencies;
        if (Array.isArray(deps)) dependencies = deps.map((d) => String((d as { itemId?: string }).itemId ?? d));
      }
      installedCompanies = count ?? 0;
    }
  } catch {
    // Registry-only fallback (marketplace not migrated/seeded).
  }

  return {
    key: agent.key,
    name: agent.name,
    role: agent.role,
    mission: agent.purpose,
    responsibilities: [...agent.responsibilities],
    skills: enrichment.skills,
    connectors: getAgentConnectors(key),
    departments: enrichment.departments,
    health: { status: "operational", label: "Operational" },
    version,
    changelog,
    dependencies,
    installedCompanies,
    roadmap: enrichment.roadmap,
    itemSlug,
    itemId: resolvedItemId,
  };
}
