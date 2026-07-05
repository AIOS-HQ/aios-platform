/**
 * Universal Clarification Engine — shared types (Phase 2.1, Foundation 2).
 *
 * The framework every AI worker inherits so it can decide "do I have enough
 * information?" and, if not, ask structured questions instead of guessing.
 */

export type QuestionKind = "single_select" | "multi_select" | "text" | "entity";

export interface ClarificationOption {
  value: string;
  label: string;
}

export interface ClarificationQuestion {
  id: string;
  prompt: string;
  kind: QuestionKind;
  whyItMatters: string;
  required: boolean;
  options?: ClarificationOption[];
}

export type ClarificationStatus = "pending" | "resolved" | "cancelled";

export interface ClarificationRequest {
  id: string;
  worker: string;
  userId: string;
  companyId?: string;
  workItemId?: string;
  questions: ClarificationQuestion[];
  answers?: Record<string, string | string[]>;
  status: ClarificationStatus;
  createdAt: string;
  resolvedAt?: string;
  /** What the worker needs to resume exactly where it paused (e.g. the objective). */
  resumePayload?: Record<string, unknown>;
  /** Law 7 (Explainable): why the pause happened — missing inputs + rationale. */
  explainability?: Record<string, unknown>;
}

/** A required input a worker needs before it can act. */
export interface RequiredInput {
  key: string;
  description: string;
  /** Finite choice set → renders as a select question. */
  options?: ClarificationOption[];
  /** Treat as an entity reference (person, repo, account, …). */
  entity?: boolean;
}

export interface SufficiencyResult {
  sufficient: boolean;
  missing: RequiredInput[];
}
