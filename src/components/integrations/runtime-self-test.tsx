"use client";

import { useState, useTransition } from "react";
import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  runGithubSelfTest,
  type SelfTestResult,
} from "@/app/(app)/harmony/developer/self-test-action";

/**
 * Admin-only control that runs the READ-ONLY GitHub runtime self-test and shows
 * the resulting CapabilityResult (outcome, attempts, latency, item count). It
 * never writes to any external system — it exercises a read capability only.
 */
export function RuntimeSelfTest() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SelfTestResult | null>(null);

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await runGithubSelfTest());
          })
        }
      >
        <PlayCircle className="size-3.5" aria-hidden="true" />
        {pending ? "Running self-test…" : "Run GitHub self-test (read-only)"}
      </Button>
      {result ? (
        <div className="rounded-md border bg-muted/30 p-3 text-xs">
          <p className="font-medium text-foreground">
            {result.ok ? "✓ Runtime path verified" : `✗ ${result.outcome}`}
          </p>
          <p className="mt-1 text-muted-foreground">
            outcome: <span className="font-mono">{result.outcome}</span> · attempts:{" "}
            <span className="font-mono">{result.attempts}</span> ·{" "}
            <span className="font-mono">{result.durationMs}ms</span>
            {result.itemCount !== null ? (
              <>
                {" "}
                · items: <span className="font-mono">{result.itemCount}</span>
              </>
            ) : null}
          </p>
          <p className="mt-1 text-muted-foreground">{result.detail}</p>
        </div>
      ) : null}
    </div>
  );
}
