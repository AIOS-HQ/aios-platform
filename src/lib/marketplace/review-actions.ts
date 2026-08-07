"use server";

import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";

/**
 * Marketplace reviews — submit/update a rating (1–5 stars) + optional written
 * review for a marketplace item. One rating per user per item: updates the
 * caller's existing rating if present, else inserts. Owner-scoped by RLS
 * (auth.uid() = user_id via the rater_* policies); marketplace assets carry no
 * secrets. Reuses the existing marketplace_item_ratings table — no schema change.
 */

export interface SubmitReviewResult {
  ok: boolean;
  error?: string;
}

export type MarketplaceModerationDecision = "approve" | "reject";

export interface MarketplaceModerationInput {
  itemId: string;
  decision: MarketplaceModerationDecision;
  reason?: string;
  policyDecision: {
    decision: "approval_required";
    requiresApproval: true;
    approvedAt: string;
    actor: "founder";
    agent: "harmony";
    domain: "operations";
    action: "publish_externally";
  };
}

export interface MarketplaceModerationResult {
  ok: boolean;
  applied: boolean;
  idempotent?: boolean;
  error?: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateModerationPolicy(input: MarketplaceModerationInput): string | null {
  const p = input.policyDecision;
  if (!p || typeof p !== "object") return "missing_policy_decision";
  if (p.decision !== "approval_required" || p.requiresApproval !== true) return "contradictory_policy_decision";
  if (!isNonEmptyString(p.approvedAt)) return "stale_policy_evidence";
  if (p.actor !== "founder" || p.agent !== "harmony" || p.domain !== "operations" || p.action !== "publish_externally") {
    return "policy_subject_mismatch";
  }
  return null;
}

export async function submitReview(
  itemId: string,
  stars: number,
  comment: string,
): Promise<SubmitReviewResult> {
  const user = await requireUser();
  const s = Math.min(5, Math.max(1, Math.round(Number(stars) || 0)));
  const text = (comment ?? "").trim().slice(0, 2000);
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("marketplace_item_ratings")
    .select("id")
    .eq("item_id", itemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("marketplace_item_ratings")
      .update({ stars: s, comment: text || null })
      .eq("id", (existing as { id: string }).id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  const { error } = await supabase
    .from("marketplace_item_ratings")
    .insert({ item_id: itemId, user_id: user.id, stars: s, comment: text || null });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Founder-governed moderation decision for marketplace publication.
 * Approve => verified + marketplace_public. Reject => rejected + company_private.
 * Repeated same decision is idempotent.
 */
export async function moderateMarketplaceItem(
  input: MarketplaceModerationInput,
): Promise<MarketplaceModerationResult> {
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  const policyError = validateModerationPolicy(input);
  if (policyError) {
    return { ok: false, applied: false, error: policyError };
  }

  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!company) {
    return { ok: false, applied: false, error: "forbidden" };
  }

  const { data: item, error: itemErr } = await supabase
    .from("marketplace_items")
    .select("id, company_id, visibility, verification")
    .eq("id", input.itemId)
    .maybeSingle();

  if (itemErr || !item) {
    return { ok: false, applied: false, error: itemErr?.message ?? "item_not_found" };
  }

  const row = item as { id: string; company_id: string | null; visibility: string; verification: string };
  if (row.company_id !== companyId) {
    return { ok: false, applied: false, error: "forbidden" };
  }

  const decisionVerification = input.decision === "approve" ? "verified" : "rejected";
  const decisionVisibility = input.decision === "approve" ? "marketplace_public" : "company_private";

  if (row.verification === decisionVerification && row.visibility === decisionVisibility) {
    return { ok: true, applied: false, idempotent: true };
  }

  const reason = (input.reason ?? "").trim().slice(0, 1000);
  const nowIso = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from("marketplace_items")
    .update({
      verification: decisionVerification,
      visibility: decisionVisibility,
      updated_at: nowIso,
      moderation_decision: input.decision,
      moderation_reason: reason || null,
      moderated_by: user.id,
      moderated_at: nowIso,
      moderation_policy_decision: input.policyDecision,
    })
    .eq("id", row.id)
    .eq("company_id", companyId);

  if (updateErr) {
    return { ok: false, applied: false, error: updateErr.message };
  }

  return { ok: true, applied: true };
}
