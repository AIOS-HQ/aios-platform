/**
 * Content Department catalog — the creative engine Harmony runs through its
 * content helpers. Pure + dependency-free (no persistence, no i18n): labels live
 * in `os.contentTask.*` / `os.contentFormat.*`, this file is the blueprint the
 * actions + UI consume.
 *
 * Hierarchy reminder: Owner → Harmony → Content Department → Content Helpers.
 * Harmony routes a content task to the right helper; the helper executes (or
 * requests approval) per its autonomy level, exactly like every other helper.
 */

/** The six content helpers (agent `key`s seeded for a Content department). */
export type ContentHelperKey =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "blog"
  | "thumbnail"
  | "seo";

export const CONTENT_HELPER_KEYS: readonly ContentHelperKey[] = [
  "youtube",
  "tiktok",
  "instagram",
  "blog",
  "thumbnail",
  "seo",
] as const;

/** Publishable content formats (used by the calendar + analytics in PR2). */
export type ContentFormat =
  | "youtube_video"
  | "youtube_short"
  | "tiktok"
  | "instagram_reel"
  | "instagram_post"
  | "blog_post"
  | "thumbnail";

export const CONTENT_FORMATS: readonly ContentFormat[] = [
  "youtube_video",
  "youtube_short",
  "tiktok",
  "instagram_reel",
  "instagram_post",
  "blog_post",
  "thumbnail",
] as const;

/**
 * The generation capabilities Harmony exposes. Each routes to a helper (or to
 * the department as a whole when `helper` is null, e.g. cross-channel strategy).
 * `format` links the output to a calendar slot where it makes sense.
 */
export type ContentTaskKey =
  | "content_strategy"
  | "content_plan"
  | "content_calendar"
  | "youtube_idea"
  | "youtube_script"
  | "tiktok_script"
  | "shorts_concept"
  | "blog_outline"
  | "thumbnail_concept"
  | "seo_plan";

export type ContentTaskType = {
  key: ContentTaskKey;
  /** Which helper owns this output; null = whole department (strategy-level). */
  helper: ContentHelperKey | null;
  /** Default calendar format produced, when applicable. */
  format?: ContentFormat;
};

export const CONTENT_TASK_TYPES: readonly ContentTaskType[] = [
  { key: "content_strategy", helper: null },
  { key: "content_plan", helper: null },
  { key: "content_calendar", helper: null },
  { key: "youtube_idea", helper: "youtube" },
  { key: "youtube_script", helper: "youtube", format: "youtube_video" },
  { key: "tiktok_script", helper: "tiktok", format: "tiktok" },
  { key: "shorts_concept", helper: "tiktok", format: "youtube_short" },
  { key: "blog_outline", helper: "blog", format: "blog_post" },
  { key: "thumbnail_concept", helper: "thumbnail", format: "thumbnail" },
  { key: "seo_plan", helper: "seo" },
] as const;

export const CONTENT_TASK_KEYS: readonly ContentTaskKey[] =
  CONTENT_TASK_TYPES.map((t) => t.key);

export function getContentTaskType(
  key: string,
): ContentTaskType | undefined {
  return CONTENT_TASK_TYPES.find((t) => t.key === key);
}

export function isContentTaskKey(key: string): key is ContentTaskKey {
  return CONTENT_TASK_KEYS.includes(key as ContentTaskKey);
}
