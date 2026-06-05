"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

type FieldValue = string | number | null | undefined;

/**
 * A submit button bound to a `Promise<void>` server action, with built-in
 * feedback: spinner + disabled while running, success/failure toast. A drop-in
 * replacement for the `<form action={…}><Button type="submit"/></form>` pattern
 * — same behavior (it still posts a real form with hidden fields), just with
 * pending state and toasts. Renders as `display:contents` so it doesn't disturb
 * the parent flex layout.
 */
export function ActionButton({
  action,
  fields,
  successMessage,
  errorMessage,
  children,
  disabled,
  ...buttonProps
}: Omit<ButtonProps, "type"> & {
  action: (formData: FormData) => Promise<void>;
  /** Hidden form fields posted with the action. */
  fields?: Record<string, FieldValue>;
  successMessage?: string;
  errorMessage?: string;
}) {
  const [pending, start] = useTransition();
  const th = useTranslations("harmony");

  function run(formData: FormData) {
    start(async () => {
      try {
        await action(formData);
        toast.success(successMessage ?? th("saved"));
      } catch (err) {
        console.error("[action-button] action failed", err);
        toast.error(errorMessage ?? th("errors.generic"));
      }
    });
  }

  return (
    <form action={run} className="contents">
      {fields &&
        Object.entries(fields).map(([k, v]) =>
          v === null || v === undefined ? null : (
            <input key={k} type="hidden" name={k} value={String(v)} />
          ),
        )}
      <Button
        {...buttonProps}
        type="submit"
        disabled={pending || disabled}
        aria-busy={pending}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          children
        )}
      </Button>
    </form>
  );
}
