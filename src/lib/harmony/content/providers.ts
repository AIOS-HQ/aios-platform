/**
 * Content engines — future integration targets (design-only).
 *
 * These are the external providers the Content Department will orchestrate once
 * credentials are connected: text/LLM for ideation + scripts, generative
 * video/voice for production, and the social platform APIs for scheduling +
 * analytics. Nothing is wired up yet — this registry drives the "Engines" panel
 * so the architecture is ready to connect them without a refactor.
 *
 * Text/LLM generation already runs through `@/lib/ai/provider` (mock until a key
 * is set); this list is the broader roadmap surfaced in the UI.
 */
export type ContentEngineCategory = "llm" | "video" | "voice" | "social";

export type ContentEngine = {
  key: string;
  name: string;
  category: ContentEngineCategory;
};

export const CONTENT_ENGINE_CATEGORIES: readonly ContentEngineCategory[] = [
  "llm",
  "video",
  "voice",
  "social",
] as const;

export const CONTENT_ENGINES: readonly ContentEngine[] = [
  { key: "openai", name: "OpenAI", category: "llm" },
  { key: "anthropic", name: "Anthropic", category: "llm" },
  { key: "gemini", name: "Gemini", category: "llm" },
  { key: "veo", name: "Veo", category: "video" },
  { key: "runway", name: "Runway", category: "video" },
  { key: "elevenlabs", name: "ElevenLabs", category: "voice" },
  { key: "youtube_api", name: "YouTube API", category: "social" },
  { key: "tiktok_api", name: "TikTok API", category: "social" },
  { key: "instagram_api", name: "Instagram API", category: "social" },
] as const;

export function contentEnginesByCategory(
  category: ContentEngineCategory,
): ContentEngine[] {
  return CONTENT_ENGINES.filter((e) => e.category === category);
}
