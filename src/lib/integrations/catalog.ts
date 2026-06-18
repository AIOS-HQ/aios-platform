/**
 * Integration provider catalog (PR #7 — framework preparation).
 *
 * Pure, client-safe metadata for the providers Harmony can connect to. The
 * STRUCTURE lives here; per-provider secrets/config are read lazily server-side
 * in `config.ts`, and localized display copy lives in the `integrations`
 * message namespace. Adding a provider = one entry here (+ env + copy).
 */

export type IntegrationAuth = "oauth2" | "api_key";
export type IntegrationCategory = "ai" | "productivity" | "communication" | "social";
export type OAuthFamily = "google" | "linkedin" | "tiktok";

export interface IntegrationProvider {
  id: string;
  name: string;
  category: IntegrationCategory;
  auth: IntegrationAuth;
  /** OAuth client family whose credentials back this provider (oauth2 only). */
  oauthFamily?: OAuthFamily;
  /** OAuth scopes requested at authorization (oauth2 only). */
  scopes?: string[];
  /** Monogram shown in the UI tile. */
  initials: string;
  docsUrl: string;
}

export const INTEGRATIONS: IntegrationProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    category: "ai",
    auth: "api_key",
    initials: "AI",
    docsUrl: "https://platform.openai.com/docs",
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    category: "productivity",
    auth: "oauth2",
    oauthFamily: "google",
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
    initials: "GC",
    docsUrl: "https://developers.google.com/calendar",
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "communication",
    auth: "oauth2",
    oauthFamily: "google",
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    initials: "GM",
    docsUrl: "https://developers.google.com/gmail/api",
  },
  {
    id: "youtube",
    name: "YouTube",
    category: "social",
    auth: "oauth2",
    oauthFamily: "google",
    scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
    initials: "YT",
    docsUrl: "https://developers.google.com/youtube",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    category: "social",
    auth: "oauth2",
    oauthFamily: "linkedin",
    scopes: ["openid", "profile", "email", "w_member_social", "w_organization_social"],
    initials: "in",
    docsUrl: "https://learn.microsoft.com/linkedin",
  },
  {
    id: "tiktok",
    name: "TikTok",
    category: "social",
    auth: "oauth2",
    oauthFamily: "tiktok",
    scopes: ["user.info.basic", "video.list"],
    initials: "TT",
    docsUrl: "https://developers.tiktok.com",
  },
];

export const INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  "ai",
  "productivity",
  "communication",
  "social",
];

export function getIntegration(id: string): IntegrationProvider | undefined {
  return INTEGRATIONS.find((p) => p.id === id);
}
