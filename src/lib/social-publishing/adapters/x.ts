import "server-only";

import { getProviderHealth } from "@/lib/integrations/connector-health";
import { getValidAccessToken } from "@/lib/integrations/token-refresh";
import { redactSecret } from "@/lib/integrations/secret-redaction";
import { downloadAssetBytes } from "@/lib/social-publishing/storage";
import { X_MAX_IMAGES } from "../media";
import type { ProviderAdapter, ProviderPublishResult, SocialMediaAsset } from "../types";

const X_API = "https://api.x.com";

function requireToken(token: string | null): string {
  if (!token) throw new Error("No valid X access token. Reconnect X with tweet.write and media.write permissions.");
  return token;
}

async function xFetch<T>(token: string, path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${X_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`X ${path} failed (${response.status}): ${redactSecret(text).slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export async function getXAccount(userId: string): Promise<{ id: string; username: string }> {
  const token = requireToken(await getValidAccessToken(userId, "x", "x"));
  const response = await xFetch<{ data?: { id?: string; username?: string } }>(
    token,
    "/2/users/me?user.fields=username",
    { method: "GET" },
  );
  const id = response.data?.id;
  const username = response.data?.username;
  if (!id || !username) throw new Error("X account identity response was incomplete.");
  return { id, username };
}

export async function uploadXImage(token: string, asset: SocialMediaAsset): Promise<string> {
  const bytes = await downloadAssetBytes(asset.storagePath);
  const form = new FormData();
  form.set("media", new Blob([Buffer.from(bytes)], { type: asset.mimeType }), asset.fileName);
  form.set("media_category", "tweet_image");
  const response = await xFetch<{ data?: { id?: string; media_key?: string } }>(token, "/2/media/upload", {
    method: "POST",
    body: form,
  });
  const id = response.data?.id ?? response.data?.media_key;
  if (!id) throw new Error("X media upload response did not include a media id.");
  return id;
}

export async function createXTweet(token: string, caption: string, mediaIds: string[]): Promise<{ id: string; url: string }> {
  const response = await xFetch<{ data?: { id?: string } }>(token, "/2/tweets", {
    method: "POST",
    body: JSON.stringify({ text: caption, media: mediaIds.length > 0 ? { media_ids: mediaIds } : undefined }),
  });
  const id = response.data?.id;
  if (!id) throw new Error("X post creation response did not include a post id.");
  return { id, url: `https://x.com/i/web/status/${id}` };
}

export const xPublishingAdapter: ProviderAdapter = {
  provider: "x",
  capabilities: {
    textPost: true,
    imagePost: true,
    multiImagePost: true,
    videoPost: false,
  },
  async verifyAccount(userId, expectedIdentity) {
    const health = await getProviderHealth(userId, "x");
    if (!health.healthy) {
      return { ok: false, identity: health.identity, blockers: health.blockers };
    }
    const missingScopes = ["tweet.write", "users.read", "media.write"].filter((scope) => !health.grantedScopes.includes(scope));
    if (missingScopes.length > 0 && health.grantedScopes.length > 0) {
      return { ok: false, identity: health.identity, blockers: [`Missing X scopes: ${missingScopes.join(", ")}`] };
    }
    const account = await getXAccount(userId);
    const identities = new Set([account.id, account.username, `@${account.username}`]);
    return {
      ok: identities.has(expectedIdentity),
      identity: account.username,
      blockers: identities.has(expectedIdentity) ? [] : ["Connected X account does not match the approved publishing target."],
    };
  },
  async publish(userId, job, media): Promise<ProviderPublishResult> {
    if (!["text", "image", "multi_image"].includes(job.contentType)) throw new Error("Unsupported X content type.");
    if (media.length > X_MAX_IMAGES) throw new Error(`X supports at most ${X_MAX_IMAGES} images per post.`);
    const token = requireToken(await getValidAccessToken(userId, "x", "x"));
    const mediaIds: string[] = [];
    for (const asset of media) {
      mediaIds.push(await uploadXImage(token, asset));
    }
    const post = await createXTweet(token, job.caption, mediaIds);
    return {
      providerPostId: post.id,
      providerPostUrl: post.url,
      providerAssetId: mediaIds.join(","),
      diagnostics: { mediaCount: mediaIds.length },
    };
  },
};
