import { describe, it, expect } from "vitest";
import {
  CONTENT_HELPER_KEYS,
  CONTENT_FORMATS,
  CONTENT_TASK_TYPES,
  CONTENT_TASK_KEYS,
  getContentTaskType,
  isContentTaskKey,
} from "@/lib/harmony/content/catalog";
import {
  CONTENT_ENGINES,
  CONTENT_ENGINE_CATEGORIES,
  contentEnginesByCategory,
} from "@/lib/harmony/content/providers";
import {
  buildContentInstruction,
  buildContentWorkItem,
} from "@/lib/harmony/content/generation";
import { getDepartmentTemplate } from "@/lib/harmony/os/catalog";
import {
  AUTONOMY_LEVELS,
  autonomyCostTier,
} from "@/lib/harmony/os/autonomy";

describe("content catalog", () => {
  it("defines the six content helpers uniquely", () => {
    expect(CONTENT_HELPER_KEYS).toHaveLength(6);
    expect(new Set(CONTENT_HELPER_KEYS).size).toBe(6);
    for (const k of ["youtube", "tiktok", "instagram", "blog", "thumbnail", "seo"]) {
      expect(CONTENT_HELPER_KEYS).toContain(k);
    }
  });

  it("exposes ten generation capabilities with unique keys", () => {
    expect(CONTENT_TASK_TYPES).toHaveLength(10);
    expect(new Set(CONTENT_TASK_KEYS).size).toBe(10);
    for (const k of [
      "content_strategy",
      "content_plan",
      "content_calendar",
      "youtube_idea",
      "youtube_script",
      "tiktok_script",
      "shorts_concept",
      "blog_outline",
      "thumbnail_concept",
      "seo_plan",
    ]) {
      expect(CONTENT_TASK_KEYS).toContain(k);
      expect(isContentTaskKey(k)).toBe(true);
    }
    expect(isContentTaskKey("nope")).toBe(false);
  });

  it("routes channel tasks to the owning helper and strategy tasks to the department", () => {
    expect(getContentTaskType("youtube_script")?.helper).toBe("youtube");
    expect(getContentTaskType("tiktok_script")?.helper).toBe("tiktok");
    expect(getContentTaskType("blog_outline")?.helper).toBe("blog");
    expect(getContentTaskType("seo_plan")?.helper).toBe("seo");
    expect(getContentTaskType("content_strategy")?.helper).toBeNull();
    expect(getContentTaskType("content_calendar")?.helper).toBeNull();
    expect(getContentTaskType("nope")).toBeUndefined();
  });

  it("every helper referenced by a task is a real helper key", () => {
    for (const task of CONTENT_TASK_TYPES) {
      if (task.helper) expect(CONTENT_HELPER_KEYS).toContain(task.helper);
      if (task.format) expect(CONTENT_FORMATS).toContain(task.format);
    }
  });
});

describe("content engines registry", () => {
  it("lists the nine future engines across all categories", () => {
    expect(CONTENT_ENGINES).toHaveLength(9);
    for (const name of [
      "OpenAI",
      "Anthropic",
      "Gemini",
      "Veo",
      "Runway",
      "ElevenLabs",
      "YouTube API",
      "TikTok API",
      "Instagram API",
    ]) {
      expect(CONTENT_ENGINES.map((e) => e.name)).toContain(name);
    }
  });

  it("groups engines by a known category", () => {
    const grouped = CONTENT_ENGINE_CATEGORIES.flatMap((c) =>
      contentEnginesByCategory(c),
    );
    expect(grouped).toHaveLength(CONTENT_ENGINES.length);
    expect(contentEnginesByCategory("llm").map((e) => e.key)).toEqual([
      "openai",
      "anthropic",
      "gemini",
    ]);
    expect(contentEnginesByCategory("social")).toHaveLength(3);
  });
});

describe("content generation builders", () => {
  it("embeds the topic in every task instruction", () => {
    for (const key of CONTENT_TASK_KEYS) {
      const text = buildContentInstruction(key, "Launch week");
      expect(text).toContain("Launch week");
      expect(text.length).toBeGreaterThan(20);
    }
  });

  it("builds a routed work item from a task + topic", () => {
    const built = buildContentWorkItem({
      taskKey: "youtube_script",
      topic: "Cold start playbook",
      label: "YouTube script",
    });
    expect(built).not.toBeNull();
    expect(built?.title).toBe("YouTube script — Cold start playbook");
    expect(built?.helper).toBe("youtube");
    expect(built?.description).toContain("Cold start playbook");
  });

  it("falls back to a label-only title when the topic is blank", () => {
    const built = buildContentWorkItem({
      taskKey: "content_strategy",
      topic: "   ",
      label: "Content strategy",
    });
    expect(built?.title).toBe("Content strategy");
    expect(built?.helper).toBeNull();
  });

  it("rejects an unknown task key", () => {
    expect(
      buildContentWorkItem({ taskKey: "nope", topic: "x", label: "X" }),
    ).toBeNull();
  });
});

describe("content department template", () => {
  it("seeds a Content department with six helpers", () => {
    const tpl = getDepartmentTemplate("content");
    expect(tpl).toBeDefined();
    expect(tpl?.agents).toHaveLength(6);
    expect(tpl?.agents.map((a) => a.key).sort()).toEqual(
      [...CONTENT_HELPER_KEYS].sort(),
    );
  });
});

describe("autonomy cost tiers", () => {
  it("assigns a rising cost tier to each of the five levels", () => {
    expect(AUTONOMY_LEVELS).toHaveLength(5);
    expect(AUTONOMY_LEVELS.map((l) => l.costTier)).toEqual([
      "",
      "$",
      "$$",
      "$$$",
      "$$$$",
    ]);
    expect(autonomyCostTier(0)).toBe("");
    expect(autonomyCostTier(4)).toBe("$$$$");
  });
});
