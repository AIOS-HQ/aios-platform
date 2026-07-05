import "server-only";

import { RetryableError } from "@/lib/integrations/runtime/retry";

/**
 * Minimal Linear GraphQL client for capability handlers (mirrors the GitHub
 * reference). 429/5xx → RetryableError; GraphQL `errors` → non-retryable Error.
 * Token supplied by the runtime.
 */

const LINEAR_API = "https://api.linear.app/graphql";

export async function linearGraphQL<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });

  if (res.status === 429 || res.status >= 500) {
    throw new RetryableError(`Linear GraphQL -> ${res.status}`, "linear_retryable");
  }
  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Linear: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  return json.data as T;
}
