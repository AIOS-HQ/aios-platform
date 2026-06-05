import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildRecommendations } from "@/lib/harmony/advisor";
import { makeTask, makeGoal, makeNote } from "../helpers/factories";

const TODAY = "2026-06-04";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildRecommendations", () => {
  it("returns a single on-track rec when nothing is actionable", () => {
    const recs = buildRecommendations({
      tasks: [makeTask({ status: "todo", due_date: "2026-07-01" })],
      goals: [
        makeGoal({ status: "active", progress: 50, updated_at: `${TODAY}T00:00:00Z` }),
      ],
      notes: [makeNote()],
    });
    expect(recs.map((r) => r.id)).toEqual(["on-track"]);
    expect(recs[0].tone).toBe("success");
  });

  it("flags due-today and overdue tasks, ignoring completed ones", () => {
    const recs = buildRecommendations({
      tasks: [
        makeTask({ due_date: TODAY }),
        makeTask({ due_date: "2026-06-01" }),
        makeTask({ due_date: "2026-06-02", status: "done" }),
      ],
      goals: [],
      notes: [],
    });
    const due = recs.find((r) => r.id === "due-today");
    const over = recs.find((r) => r.id === "overdue");
    expect(due?.values).toEqual({ count: 1 });
    expect(due?.tone).toBe("info");
    expect(over?.values).toEqual({ count: 1 });
    expect(over?.tone).toBe("warning");
  });

  it("flags stale active goals (>= 7 days) and almost-there goals (80-99%)", () => {
    const recs = buildRecommendations({
      tasks: [makeTask()],
      goals: [
        makeGoal({ status: "active", progress: 10, updated_at: "2026-05-20T00:00:00Z" }),
        makeGoal({ status: "active", progress: 90, updated_at: `${TODAY}T00:00:00Z` }),
        makeGoal({ status: "paused", progress: 5, updated_at: "2026-01-01T00:00:00Z" }),
      ],
      notes: [],
    });
    const ids = recs.map((r) => r.id);
    expect(ids).toContain("stale-goals");
    expect(ids).toContain("almost");
  });

  it("suggests organizing notes once there are 10 or more", () => {
    const recs = buildRecommendations({
      tasks: [makeTask()],
      goals: [],
      notes: Array.from({ length: 10 }, () => makeNote()),
    });
    expect(recs.map((r) => r.id)).toContain("organize-notes");
  });

  it("prompts to create a first task and goal when empty", () => {
    const recs = buildRecommendations({ tasks: [], goals: [], notes: [] });
    const ids = recs.map((r) => r.id);
    expect(ids).toContain("first-task");
    expect(ids).toContain("first-goal");
  });

  it("celebrates all-clear when tasks exist but none are open or overdue", () => {
    const recs = buildRecommendations({
      tasks: [makeTask({ status: "done", due_date: "2026-06-01" })],
      goals: [makeGoal()],
      notes: [],
    });
    expect(recs.map((r) => r.id)).toContain("all-clear");
  });
});
