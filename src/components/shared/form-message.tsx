import { cn } from "@/lib/utils";
import type { ActionState } from "@/lib/types";

/** Inline status/error message for forms. Announced to assistive tech. */
export function FormMessage({
  state,
  id,
  diagnosticCode,
}: {
  state: ActionState;
  id?: string;
  diagnosticCode?: string;
}) {
  if (state.status === "idle" || !state.message) return null;
  const isError = state.status === "error";
  return (
    <p
      id={id}
      role={isError ? "alert" : "status"}
      data-auth-error-code={isError && diagnosticCode ? diagnosticCode : undefined}
      className={cn(
        "rounded-md px-3 py-2 text-sm",
        isError
          ? "bg-destructive/10 text-destructive"
          : "bg-success/10 text-success",
      )}
    >
      {state.message}
    </p>
  );
}
