"use server";

import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { searchJuliusSemantic } from "@/lib/julius/service";
import { searchJuliusAcrossCompanies, rankJuliusEntries } from "@/lib/julius/retrieval";
import type { JuliusHit, JuliusScope } from "./julius-search-types";

/**
 * Julius semantic-search Server Action — connects Harmony's UI to the existing
 * Julius Intelligence layer. Consumes only existing server libs (service +
 * retrieval); adds NO backend/API surface. Owner-scoped via requireUser and the
 * RLS server client inside the libs. Returns a serializable, ranked result set.
 */
export async function searchJulius(query: string, scope: JuliusScope): Promise<JuliusHit[]> {
  const user = await requireUser();
  const q = (query ?? "").trim();
  if (!q) return [];

  let entries;
  if (scope === "global") {
    entries = await searchJuliusAcrossCompanies(user.id, q, 15);
  } else {
    const companyId = await resolvePrimaryCompanyId();
    entries = companyId ? await searchJuliusSemantic(user.id, companyId, q, 15) : [];
  }

  return rankJuliusEntries(entries).map((e) => ({
    id: e.id,
    title: e.title,
    content: e.content,
    kind: e.kind,
    agent: e.agent,
    importance: e.importance,
    similarity: e.similarity ?? null,
  }));
}
