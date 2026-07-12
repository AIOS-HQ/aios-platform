import "server-only";

import { googleFetch, requireToken } from "@/lib/integrations/providers/google/api";
import { registerCapabilityHandler } from "@/lib/integrations/runtime/runtime";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

interface ChannelRef {
  channelId: string;
}

let registered = false;

export function registerYouTubeCapabilities(): void {
  if (registered) return;
  registered = true;

  registerCapabilityHandler("youtube", "list_channels", async ({ accessToken }) =>
    googleFetch(YOUTUBE_API, requireToken(accessToken), {
      path: "/channels?part=id,snippet,statistics&mine=true&maxResults=50",
    }));

  registerCapabilityHandler<ChannelRef, unknown>("youtube", "read_channel", async ({ accessToken, input }) => {
    if (!input.channelId) throw new Error("YouTube channelId is required.");
    return googleFetch(YOUTUBE_API, requireToken(accessToken), {
      path: `/channels?part=id,snippet,statistics&id=${encodeURIComponent(input.channelId)}`,
    });
  });
}
