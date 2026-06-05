/** Shared result shape for Server Actions used with React's `useActionState`. */
export type ActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  /** Optional structured result, e.g. a created entity id for a follow-up link. */
  meta?: Record<string, string>;
};

export const idleState: ActionState = { status: "idle" };
