import "server-only";

import { registerCapabilityHandler } from "@/lib/integrations/runtime/runtime";
import { notionFetch } from "./client";

/**
 * Notion capability implementation (Group B.2) — mirrors the GitHub reference.
 * Registry capabilities: search, read_page (read); create_page (routine write);
 * update_page (approval-gated). Runtime owns auth/retry/telemetry/governance.
 */

interface SearchInput {
  query?: string;
}
interface PageRef {
  pageId: string;
}
interface CreatePageInput {
  parent: Record<string, unknown>;
  properties: Record<string, unknown>;
  children?: unknown[];
}
interface UpdatePageInput {
  pageId: string;
  properties: Record<string, unknown>;
}

function requireToken(token: string | null): string {
  if (!token) throw new Error("Missing Notion access token");
  return token;
}

let registered = false;

export function registerNotionCapabilities(): void {
  if (registered) return;
  registered = true;

  registerCapabilityHandler<SearchInput, unknown>("notion", "search", async ({ accessToken, input }) =>
    notionFetch(requireToken(accessToken), { method: "POST", path: "/search", body: { query: input.query ?? "" } }),
  );
  registerCapabilityHandler<PageRef, unknown>("notion", "read_page", async ({ accessToken, input }) =>
    notionFetch(requireToken(accessToken), { path: `/pages/${input.pageId}` }),
  );
  registerCapabilityHandler<CreatePageInput, unknown>("notion", "create_page", async ({ accessToken, input }) =>
    notionFetch(requireToken(accessToken), {
      method: "POST",
      path: "/pages",
      body: { parent: input.parent, properties: input.properties, children: input.children },
    }),
  );
  registerCapabilityHandler<UpdatePageInput, unknown>("notion", "update_page", async ({ accessToken, input }) =>
    notionFetch(requireToken(accessToken), {
      method: "PATCH",
      path: `/pages/${input.pageId}`,
      body: { properties: input.properties },
    }),
  );
}
