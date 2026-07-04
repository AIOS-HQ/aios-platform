import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ClarificationRequest, ClarificationQuestion } from "./types";
import type { ClarificationStore } from "./store";
import { setClarificationStore } from "./store";

/**
 * Persistent, RLS-scoped Clarification store backed by public.clarification_requests
 * (Track 3 migration). Makes a paused worker turn resumable across requests —
 * the foundation for persistent execution. Owner-scoped via the RLS server
 * client; degrades gracefully if the table/columns are absent.
 */

const COLS =
  "id,user_id,company_id,worker,work_item_id,questions,answers,status,resume_payload,explainability,created_at,resolved_at";

interface Row {
  id: string;
  user_id: string;
  company_id: string | null;
  worker: string;
  work_item_id: string | null;
  questions: ClarificationQuestion[] | null;
  answers: Record<string, string | string[]> | null;
  status: ClarificationRequest["status"];
  resume_payload: Record<string, unknown> | null;
  explainability: Record<string, unknown> | null;
  created_at: string;
  resolved_at: string | null;
}

function fromRow(row: Row): ClarificationRequest {
  return {
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id ?? undefined,
    worker: row.worker,
    workItemId: row.work_item_id ?? undefined,
    questions: row.questions ?? [],
    answers: row.answers ?? undefined,
    status: row.status,
    resumePayload: row.resume_payload ?? undefined,
    explainability: row.explainability ?? undefined,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}

function toRow(req: ClarificationRequest): Record<string, unknown> {
  return {
    id: req.id,
    user_id: req.userId,
    company_id: req.companyId ?? null,
    worker: req.worker,
    work_item_id: req.workItemId ?? null,
    questions: req.questions,
    answers: req.answers ?? null,
    status: req.status,
    resume_payload: req.resumePayload ?? null,
    explainability: req.explainability ?? null,
    created_at: req.createdAt,
    resolved_at: req.resolvedAt ?? null,
  };
}

class SupabaseClarificationStore implements ClarificationStore {
  async create(req: ClarificationRequest): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("clarification_requests").insert(toRow(req));
    if (error) console.error("[clarification/store] create", error.message);
  }

  async get(id: string): Promise<ClarificationRequest | undefined> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clarification_requests")
      .select(COLS)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("[clarification/store] get", error.message);
      return undefined;
    }
    return data ? fromRow(data as unknown as Row) : undefined;
  }

  async update(req: ClarificationRequest): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("clarification_requests")
      .upsert(toRow(req), { onConflict: "id" });
    if (error) console.error("[clarification/store] update", error.message);
  }

  async listPending(userId: string): Promise<ClarificationRequest[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clarification_requests")
      .select(COLS)
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("[clarification/store] listPending", error.message);
      return [];
    }
    return ((data as unknown as Row[] | null) ?? []).map(fromRow);
  }
}

let installed = false;

/** Install the persistent store as the active ClarificationStore (idempotent). */
export function ensureSupabaseClarificationStore(): void {
  if (installed) return;
  installed = true;
  setClarificationStore(new SupabaseClarificationStore());
}
