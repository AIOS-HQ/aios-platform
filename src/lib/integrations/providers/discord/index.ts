import "server-only";

import { registerCapabilityHandler } from "@/lib/integrations/runtime/runtime";
import { discordFetch } from "./client";

/** Discord capabilities: list_guilds (read); post_message (approval-gated). */
interface PostMessageInput {
  channelId: string;
  content: string;
}

function requireToken(token: string | null): string {
  if (!token) throw new Error("Missing Discord access token");
  return token;
}

let registered = false;

export function registerDiscordCapabilities(): void {
  if (registered) return;
  registered = true;

  registerCapabilityHandler("discord", "list_guilds", async ({ accessToken }) =>
    discordFetch(requireToken(accessToken), { path: "/users/@me/guilds" }),
  );
  registerCapabilityHandler<PostMessageInput, unknown>("discord", "post_message", async ({ accessToken, input }) =>
    discordFetch(requireToken(accessToken), {
      method: "POST",
      path: `/channels/${input.channelId}/messages`,
      body: { content: input.content },
    }),
  );
}
