import "server-only";

import { listCompanies } from "@/lib/data/os/companies";
import { getEnvelope } from "@/lib/company/envelope";

/**
 * Multi-Company Operating System (Foundation 15, Priority 14).
 *
 * One Founder manages multiple organizations. Harmony switches Company Context
 * by resolving the active company; Julius already keeps memory per company
 * (every entry is company-scoped), so institutional memory stays isolated while
 * the same universal runtime serves every org. Additive + inert; owner-scoped
 * (listCompanies + envelope reads via RLS).
 */

export interface FounderCompany {
  id: string;
  name: string | null;
  slug: string | null;
  industry: string | null;
  isActive: boolean;
}

interface CompanyRow {
  id: string;
  name?: string | null;
  slug?: string | null;
}

/** All of the Founder's companies, enriched with envelope identity. */
export async function listFounderCompanies(activeCompanyId?: string): Promise<FounderCompany[]> {
  const companies = (await listCompanies()) as unknown as CompanyRow[];
  const out: FounderCompany[] = [];
  for (const c of companies) {
    const envelope = await getEnvelope(c.id);
    out.push({
      id: c.id,
      name: c.name ?? envelope?.companyName ?? null,
      slug: c.slug ?? null,
      industry: envelope?.industry ?? null,
      isActive: activeCompanyId === c.id,
    });
  }
  return out;
}

/**
 * Resolve the Founder's active company (preferred id if it belongs to them,
 * else the first). Null when the Founder has no companies yet.
 */
export async function resolveActiveCompany(preferredId?: string): Promise<FounderCompany | null> {
  const companies = await listFounderCompanies(preferredId);
  if (companies.length === 0) return null;
  const preferred = preferredId ? companies.find((c) => c.id === preferredId) : undefined;
  const chosen = preferred ?? companies[0];
  return { ...chosen, isActive: true };
}
