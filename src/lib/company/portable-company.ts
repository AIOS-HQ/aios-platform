import "server-only";

import {
  exportWorkforce,
  importWorkforce,
  type WorkforcePackage,
} from "@/lib/company/portability";
import { buildDigitalTwin, type DigitalTwin } from "@/lib/company/digital-twin";
import { getCompanyFinancialSnapshot, type FinancialSnapshot } from "@/lib/ledger";

/**
 * Portable Company (Foundation P8 → expanded) — export/import an ENTIRE
 * autonomous company as data, so it can be redeployed to another AIOS instance
 * with minimal manual setup.
 *
 * A company IS its Company Context Envelope (the 30-section identity: branding,
 * governance, policies, founder settings, departments, objectives, projects,
 * dashboards, reports, and connector bindings — all config) + its brain (Julius
 * memory) + its skills. The `WorkforcePackage` already serializes that whole
 * identity, so a Portable Company bundle = that package PLUS the derived
 * operating model (Digital Twin), the point-in-time financial snapshot (Ledger),
 * and the list of installed Marketplace assets to re-provision in the target.
 *
 * SECURITY (inherited): bundles carry configuration + knowledge ONLY — never
 * secrets/tokens. Connector bindings are config-only; the operator re-consents
 * credentials in the target company after import.
 *
 * Additive + inert: explicit entry points, no automatic caller. Import writes
 * are owner-scoped (RLS) and reuse the audited `importWorkforce` path. Derived
 * views (Digital Twin, Ledger) are intentionally NOT written on import — they
 * recompute from the restored envelope in the target. Marketplace assets are
 * returned as a provisioning plan (installation persistence is Founder-gated).
 */

const BUNDLE_SCHEMA_VERSION = 1;

/** A marketplace asset the company has installed, to re-provision on import. */
export interface MarketplaceAssetRef {
  itemId: string;
  kind: string;
  version: string;
}

export interface PortableCompanyBundle {
  schemaVersion: number;
  exportedAt: string;
  sourceCompanyId: string;
  /** The full company identity: envelope (30 sections) + skills + Julius memory. */
  workforce: WorkforcePackage;
  /** Derived operating model — recomputed in the target, included for parity checks. */
  digitalTwin: DigitalTwin;
  /** Point-in-time financial snapshot (recomputed in the target from the envelope). */
  ledger: FinancialSnapshot;
  /** Installed marketplace assets to re-provision in the target company. */
  marketplaceAssets: MarketplaceAssetRef[];
  counts: {
    skills: number;
    memory: number;
    departments: number;
    objectives: number;
    aiWorkforce: number;
    marketplaceAssets: number;
  };
  note: string;
}

/**
 * Export a company as a portable, secret-free bundle. Composes the existing
 * read-models — nothing is mutated. `marketplaceAssets` is supplied by the
 * caller (from the installations catalog) so this stays decoupled from the
 * Founder-gated marketplace persistence.
 */
export async function exportCompany(
  userId: string,
  companyId: string,
  opts: { marketplaceAssets?: MarketplaceAssetRef[] } = {},
): Promise<PortableCompanyBundle> {
  const [workforce, digitalTwin, ledger] = await Promise.all([
    exportWorkforce(userId, companyId),
    buildDigitalTwin(userId, companyId),
    getCompanyFinancialSnapshot(companyId),
  ]);

  const marketplaceAssets = opts.marketplaceAssets ?? [];

  return {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sourceCompanyId: companyId,
    workforce,
    digitalTwin,
    ledger,
    marketplaceAssets,
    counts: {
      skills: workforce.counts.skills,
      memory: workforce.counts.memory,
      departments: digitalTwin.organization.departments,
      objectives: digitalTwin.direction.objectives,
      aiWorkforce: digitalTwin.organization.aiWorkforce,
      marketplaceAssets: marketplaceAssets.length,
    },
    note:
      "Entire company as config + knowledge. No secrets/tokens. Re-consent connectors, " +
      "and re-provision marketplace assets, in the target company after import.",
  };
}

/** Validate a bundle before import (schema compatibility). Pure. */
export function validateBundle(bundle: PortableCompanyBundle): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!bundle || typeof bundle !== "object") errors.push("Bundle is not an object");
  else {
    if (bundle.schemaVersion !== BUNDLE_SCHEMA_VERSION) {
      errors.push(`Unsupported schema version ${bundle.schemaVersion} (expected ${BUNDLE_SCHEMA_VERSION})`);
    }
    if (!bundle.workforce) errors.push("Bundle is missing its workforce/company identity");
  }
  return { ok: errors.length === 0, errors };
}

export interface PortableCompanyImportResult {
  ok: boolean;
  errors: string[];
  envelopeRestored: boolean;
  memoryRestored: number;
  skillsInBundle: number;
  /** Derived views that recompute from the restored envelope (not written). */
  derivedRebuilt: string[];
  /** Marketplace assets to provision once the target has them available. */
  marketplaceAssetsToProvision: MarketplaceAssetRef[];
  note: string;
}

/**
 * Rehydrate a whole company under a target company_id. Restores the full
 * envelope identity + Julius memory via the audited `importWorkforce` path;
 * Digital Twin and Ledger recompute from the restored envelope; marketplace
 * assets are returned as a provisioning plan. No tokens move — connectors need
 * re-consent in the target.
 */
export async function importCompany(
  userId: string,
  targetCompanyId: string,
  bundle: PortableCompanyBundle,
): Promise<PortableCompanyImportResult> {
  const validation = validateBundle(bundle);
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
      envelopeRestored: false,
      memoryRestored: 0,
      skillsInBundle: 0,
      derivedRebuilt: [],
      marketplaceAssetsToProvision: [],
      note: "Import aborted — invalid bundle.",
    };
  }

  const restored = await importWorkforce(userId, targetCompanyId, bundle.workforce);

  return {
    ok: true,
    errors: [],
    envelopeRestored: restored.envelopeRestored,
    memoryRestored: restored.memoryRestored,
    skillsInBundle: restored.skillsInPackage,
    derivedRebuilt: ["digitalTwin", "ledger"],
    marketplaceAssetsToProvision: bundle.marketplaceAssets,
    note:
      "Company identity + brain restored. Digital Twin and Ledger recompute from the envelope. " +
      "Re-consent connectors and provision marketplace assets in the target company.",
  };
}
