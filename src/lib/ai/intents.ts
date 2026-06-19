import type { OperatorIntent } from "./types";

const TASK_KW = [
  "add task",
  "create task",
  "new task",
  "task:",
  "add a task",
  "remind me to",
  "todo",
  "to-do",
  "crear tarea",
  "nueva tarea",
  "agregar tarea",
  "tarea:",
  "recuérdame",
  "recuerdame",
];

const GOAL_KW = [
  "add goal",
  "create goal",
  "new goal",
  "goal:",
  "set a goal",
  "crear objetivo",
  "nuevo objetivo",
  "objetivo:",
  "meta:",
  "nueva meta",
];

const SUMMARIZE_KW = [
  "summarize",
  "summary",
  "summarise",
  "resume",
  "resumen",
  "resumir",
];

const NEXT_KW = [
  "next step",
  "what should i",
  "what to do",
  "suggest",
  "prioriti",
  "recommend",
  "qué sigue",
  "que sigue",
  "siguiente paso",
  "sugiere",
  "recomienda",
  "qué hago",
];
const EXECUTION_KW = [
  "github",
  "repo",
  "repository",
  "issue",
  "pull request",
  "pr",
  "branch",
  "vercel",
  "deploy",
  "deployment",
  "supabase",
  "database",
  "migration",
  "audit",
  "fix",
  "repair",
  "connector",
  "integration",
];

function extractTitle(input: string, keywords: string[]): string {
  const lower = input.toLowerCase();
  let at = -1;
  let len = 0;
  for (const k of keywords) {
    const i = lower.indexOf(k);
    if (i !== -1 && (at === -1 || i < at)) {
      at = i;
      len = k.length;
    }
  }
  let rest = at === -1 ? input : input.slice(at + len);
  rest = rest.replace(/^[\s:,\-–]+/, "");
  rest = rest.replace(/^(to|a|an|the|that i|que|de|para)\s+/i, "");
  return rest.trim();
}

/** Lightweight, bilingual (EN/ES) keyword intent detection for the Operator. */
export function detectIntent(input: string): {
  intent: OperatorIntent;
  title?: string;
} {
  const text = input.toLowerCase();
  if (TASK_KW.some((k) => text.includes(k))) {
    return { intent: "create_task", title: extractTitle(input, TASK_KW) };
  }
  if (GOAL_KW.some((k) => text.includes(k))) {
    return { intent: "create_goal", title: extractTitle(input, GOAL_KW) };
  }
  if (SUMMARIZE_KW.some((k) => text.includes(k))) {
    return { intent: "summarize_notes" };
  }
  if (NEXT_KW.some((k) => text.includes(k))) {
    return { intent: "suggest_next_steps" };
  }
  if (EXECUTION_KW.some((k) => text.includes(k))) {
  return {
    intent: "execution_request",
    title: input.trim(),
  };
}
  return { intent: "general" };
}
