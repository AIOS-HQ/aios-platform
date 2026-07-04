import type {
  ClarificationQuestion,
  ClarificationRequest,
  RequiredInput,
  SufficiencyResult,
} from "./types";

/**
 * Clarification engine — pure, universal logic (no I/O, no provider coupling).
 * Detects ambiguity, generates structured questions, and applies answers.
 */

function newId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  return g.crypto?.randomUUID
    ? g.crypto.randomUUID()
    : `clr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Detect ambiguity: which required inputs are missing/empty in the given context. */
export function assessSufficiency(
  required: RequiredInput[],
  context: Record<string, unknown>,
): SufficiencyResult {
  const missing = required.filter((r) => {
    const v = context[r.key];
    if (v === undefined || v === null) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  });
  return { sufficient: missing.length === 0, missing };
}

/** Turn missing inputs into structured clarification questions. */
export function buildQuestions(missing: RequiredInput[]): ClarificationQuestion[] {
  return missing.map((r) => ({
    id: r.key,
    prompt: r.options ? `Which ${r.description}?` : `Please provide ${r.description}.`,
    kind: r.options ? "single_select" : r.entity ? "entity" : "text",
    whyItMatters: `Required to proceed safely: ${r.description}.`,
    required: true,
    options: r.options,
  }));
}

/** Build a full clarification request for a worker. */
export function createClarificationRequest(args: {
  worker: string;
  userId: string;
  companyId?: string;
  workItemId?: string;
  missing: RequiredInput[];
}): ClarificationRequest {
  return {
    id: newId(),
    worker: args.worker,
    userId: args.userId,
    companyId: args.companyId,
    workItemId: args.workItemId,
    questions: buildQuestions(args.missing),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Apply collected answers to a request. Returns the resolved request plus the
 * derived facts (so the caller can persist them to Julius, closing the loop).
 */
export function applyAnswers(
  request: ClarificationRequest,
  answers: Record<string, string | string[]>,
): { request: ClarificationRequest; facts: Record<string, string | string[]> } {
  const resolved: ClarificationRequest = {
    ...request,
    answers,
    status: "resolved",
    resolvedAt: new Date().toISOString(),
  };
  return { request: resolved, facts: answers };
}
