import "server-only";

import { registerCapabilityHandler } from "@/lib/integrations/runtime/runtime";
import { slackFetch } from "./client";

/**
 * Slack capability implementation (Group B.2) — mirrors the GitHub reference.
 * Thin handlers on the Universal Capability Runtime; the runtime owns loading,
 * permissions (risk class), retry, telemetry, diagnostics, recovery, governance.
 *
 * Registered against the registry's Slack capability ids. `summarize_discussion`
 * is an AI capability (not a raw API call) and is intentionally left to the
 * worker layer — the runtime reports it not_implemented until wired there.
 */

interface ChannelRef {
  channel: string;
}
interface PostInput {
  channel: string;
  text: string;
}

function requireToken(token: string | null): string {
  if (!token) throw new Error("Missing Slack access token");
  return token;
}

let registered = false;

export function registerSlackCapabilities(): void {
  if (registered) return;
  registered = true;

  // ── Reads (routine → autonomous) ─────────────────────────────────────────
  registerCapabilityHandler("slack", "list_channels", async ({ accessToken }) =>
    slackFetch(requireToken(accessToken), {
      method: "conversations.list",
      query: { types: "public_channel", limit: "200" },
    }),
  );
  registerCapabilityHandler<ChannelRef, unknown>("slack", "monitor_channels", async ({ accessToken, input }) =>
    slackFetch(requireToken(accessToken), {
      method: "conversations.history",
      query: { channel: input.channel, limit: "50" },
    }),
  );

  // ── Routine writes ───────────────────────────────────────────────────────
  registerCapabilityHandler<PostInput, unknown>("slack", "respond_routine", async ({ accessToken, input }) =>
    slackFetch(requireToken(accessToken), {
      method: "chat.postMessage",
      body: { channel: input.channel, text: input.text },
    }),
  );
  registerCapabilityHandler<PostInput, unknown>("slack", "route_issue", async ({ accessToken, input }) =>
    slackFetch(requireToken(accessToken), {
      method: "chat.postMessage",
      body: { channel: input.channel, text: input.text },
    }),
  );

  // ── Approval-gated (runtime enforces authorize before this runs) ─────────
  registerCapabilityHandler<PostInput, unknown>("slack", "post_announcement", async ({ accessToken, input }) =>
    slackFetch(requireToken(accessToken), {
      method: "chat.postMessage",
      body: { channel: input.channel, text: input.text },
    }),
  );
}
