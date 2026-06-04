/** Shared result shape for Server Actions used with React's `useActionState`. */
export type ActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export const idleState: ActionState = { status: "idle" };
