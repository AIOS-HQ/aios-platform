"use server";

import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import { planInstall, planUpdate, planRollback, planUninstall } from "./install";
import { loadCatalog, loadInstallState } from "./persistence";
import type { Catalog, InstallActionKind, InstallPlan } from "./types";

/**
 * Marketplace install lifecycle — server actions (Founder-approved persistence).
 *
 * Each action loads the RLS-scoped catalog + the company's installed-state, asks
 * the pure engine for a plan (dependencies resolved; cycles/conflicts detected;
 * uninstall blocked on dependents), and only then applies it — writing
 * owner-scoped rows to `company_installations`. Every write is guarded by
 * company ownership AND RLS (auth.uid() = user_id). A blocked plan is returned
 * as-is and nothing is written, so the human always sees why before anything
 * changes. Marketplace assets are config/knowledge only — no secrets move.
 */

export interface ApplyResult {
  plan: InstallPlan;
  applied: boolean;
  error?: string;
}

function blockedPlan(action: InstallActionKind, itemId: string, reason: string): InstallPlan {
  return {
    action,
    itemId,
    fromVersion: null,
    toVersion: null,
    steps: [],
    warnings: [],
    blocked: true,
    reasons: [reason],
  };
}

async function ownsCompany(userId: string, companyId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/** Upsert the plan's steps as installation rows (install / update / rollback). */
async function applySteps(
  userId: string,
  companyId: string,
  catalog: Catalog,
  plan: InstallPlan,
): Promise<ApplyResult> {
  if (plan.steps.length === 0) return { plan, applied: true };
  const supabase = await createClient();
  const now = new Date().toISOString();
  const rows = plan.steps.map((s) => ({
    user_id: userId,
    company_id: companyId,
    item_id: s.itemId,
    kind: s.kind,
    installed_version: s.version,
    source: catalog[s.itemId]?.visibility ?? "marketplace_public",
    enabled: true,
    updated_at: now,
  }));
  const { error } = await supabase
    .from("company_installations")
    .upsert(rows, { onConflict: "company_id,item_id" });
  if (error) return { plan, applied: false, error: error.message };
  return { plan, applied: true };
}

export async function installMarketplaceItem(
  companyId: string,
  itemId: string,
  version?: string,
): Promise<ApplyResult> {
  const user = await requireUser();
  if (!(await ownsCompany(user.id, companyId))) {
    return { plan: blockedPlan("install", itemId, "Company not found or not owned"), applied: false, error: "forbidden" };
  }
  const [catalog, state] = await Promise.all([loadCatalog(), loadInstallState(user.id, companyId)]);
  const plan = planInstall(catalog, state, itemId, version ? { version } : {});
  if (plan.blocked) return { plan, applied: false };
  return applySteps(user.id, companyId, catalog, plan);
}

export async function updateMarketplaceItem(companyId: string, itemId: string): Promise<ApplyResult> {
  const user = await requireUser();
  if (!(await ownsCompany(user.id, companyId))) {
    return { plan: blockedPlan("update", itemId, "Company not found or not owned"), applied: false, error: "forbidden" };
  }
  const [catalog, state] = await Promise.all([loadCatalog(), loadInstallState(user.id, companyId)]);
  const plan = planUpdate(catalog, state, itemId);
  if (plan.blocked) return { plan, applied: false };
  return applySteps(user.id, companyId, catalog, plan);
}

export async function rollbackMarketplaceItem(
  companyId: string,
  itemId: string,
  toVersion: string,
): Promise<ApplyResult> {
  const user = await requireUser();
  if (!(await ownsCompany(user.id, companyId))) {
    return { plan: blockedPlan("rollback", itemId, "Company not found or not owned"), applied: false, error: "forbidden" };
  }
  const [catalog, state] = await Promise.all([loadCatalog(), loadInstallState(user.id, companyId)]);
  const plan = planRollback(catalog, state, itemId, toVersion);
  if (plan.blocked) return { plan, applied: false };
  return applySteps(user.id, companyId, catalog, plan);
}

export async function uninstallMarketplaceItem(companyId: string, itemId: string): Promise<ApplyResult> {
  const user = await requireUser();
  if (!(await ownsCompany(user.id, companyId))) {
    return { plan: blockedPlan("uninstall", itemId, "Company not found or not owned"), applied: false, error: "forbidden" };
  }
  const [catalog, state] = await Promise.all([loadCatalog(), loadInstallState(user.id, companyId)]);
  const plan = planUninstall(catalog, state, itemId);
  if (plan.blocked) return { plan, applied: false };
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_installations")
    .delete()
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .eq("item_id", itemId);
  if (error) return { plan, applied: false, error: error.message };
  return { plan, applied: true };
}
