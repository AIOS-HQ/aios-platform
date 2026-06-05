/**
 * Content generation prompt builders. Pure + dependency-free so they're unit
 * testable and reusable on the server (the actions feed the result into the
 * shared AI provider via the Helper Execution System).
 *
 * Each builder turns a short topic/brief into a detailed instruction for the
 * content helper. The text is the *ask* sent to the AI provider — not UI chrome
 * — so it lives here rather than in the i18n catalogs. When a real provider is
 * connected these prompts shape its output; until then the mock provider echoes
 * a deterministic stub.
 */
import {
  getContentTaskType,
  isContentTaskKey,
  type ContentTaskKey,
} from "./catalog";

type InstructionBuilder = (topic: string) => string;

const BUILDERS: Record<ContentTaskKey, InstructionBuilder> = {
  content_strategy: (t) =>
    `Develop a content strategy for: ${t}\n\nCover: target audience and positioning, the 3–5 content pillars, the channel mix (YouTube, TikTok, Instagram, blog), cadence, and the key metrics to track. Keep it concrete and actionable.`,
  content_plan: (t) =>
    `Produce a 30-day content plan for: ${t}\n\nList specific pieces with: working title, format, target channel, the hook/angle, and the goal of each. Sequence them so they build on one another.`,
  content_calendar: (t) =>
    `Draft a 4-week content calendar for: ${t}\n\nFor each week give day-by-day slots with format (long-form video, short, reel, post, blog), working title, and channel. Balance the mix and note repurposing opportunities.`,
  youtube_idea: (t) =>
    `Generate 10 YouTube video ideas about: ${t}\n\nFor each: a compelling title, a one-line hook, the core promise to the viewer, and why it would perform. Favor searchable, high-intent angles.`,
  youtube_script: (t) =>
    `Write a full YouTube video script about: ${t}\n\nInclude: a strong 15-second hook, a clear intro that states the payoff, well-structured main segments with talking points, B-roll/visual cues, and an outro with a call to action.`,
  tiktok_script: (t) =>
    `Write a TikTok script about: ${t}\n\nKeep it 30–45 seconds. Open with a scroll-stopping hook in the first 2 seconds, deliver fast value in punchy beats, add on-screen text cues, and end with a loop or CTA.`,
  shorts_concept: (t) =>
    `Create 5 short-form (Shorts/Reels) concepts about: ${t}\n\nFor each: the hook line, the visual idea, the payoff, and a caption. Optimize for completion rate and shareability.`,
  blog_outline: (t) =>
    `Create a detailed blog post outline about: ${t}\n\nInclude: an SEO-minded H1, a meta description, H2/H3 section headings with bullet points under each, suggested internal/external link targets, and a closing CTA.`,
  thumbnail_concept: (t) =>
    `Propose 3 thumbnail concepts for: ${t}\n\nFor each: the focal image, the 3–5 word overlay text, the color/emotion direction, and why it earns the click. Describe them clearly enough for a designer to execute.`,
  seo_plan: (t) =>
    `Build an SEO plan for: ${t}\n\nInclude: a primary keyword and a cluster of secondary/long-tail keywords with intent, on-page recommendations, content gaps to fill, and a prioritized action list.`,
};

/** Build the detailed instruction (the AI ask) for a content task + topic. */
export function buildContentInstruction(
  taskKey: ContentTaskKey,
  topic: string,
): string {
  const trimmed = topic.trim() || "this topic";
  return BUILDERS[taskKey](trimmed);
}

/**
 * Resolve a content task into the work-item fields Harmony delegates: a concise
 * title (label + topic) and the detailed instruction as the description. The
 * caller supplies the localized label for the task type.
 */
export function buildContentWorkItem(input: {
  taskKey: string;
  topic: string;
  label: string;
}): { title: string; description: string; helper: string | null } | null {
  if (!isContentTaskKey(input.taskKey)) return null;
  const type = getContentTaskType(input.taskKey);
  const topic = input.topic.trim();
  const title = topic ? `${input.label} — ${topic}` : input.label;
  return {
    title,
    description: buildContentInstruction(input.taskKey, input.topic),
    helper: type?.helper ?? null,
  };
}
