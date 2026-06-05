import { describe, it, expect, afterEach, vi } from "vitest";
import {
  sortTasks,
  groupTasks,
  tasksForGoal,
  sortByPosition,
  moveId,
} from "@/lib/harmony/task-view";
import { makeTask } from "../helpers/factories";

afterEach(() => {
  vi.useRealTimers();
});

describe("sortTasks", () => {
  it("sorts by due date ascending, nulls last, ties broken by priority", () => {
    const a = makeTask({ due_date: "2026-06-10", priority: "low" });
    const b = makeTask({ due_date: "2026-06-01", priority: "low" });
    const c = makeTask({ due_date: null, priority: "high" });
    const d = makeTask({ due_date: "2026-06-01", priority: "high" });
    const out = sortTasks([a, b, c, d], "due");
    expect(out.map((t) => t.id)).toEqual([d.id, b.id, a.id, c.id]);
  });

  it("sorts by priority high->low, ties broken by due date", () => {
    const hiLate = makeTask({ priority: "high", due_date: "2026-06-05" });
    const hiEarly = makeTask({ priority: "high", due_date: "2026-06-02" });
    const lo = makeTask({ priority: "low", due_date: "2026-06-01" });
    const out = sortTasks([hiLate, hiEarly, lo], "priority");
    expect(out.map((t) => t.id)).toEqual([hiEarly.id, hiLate.id, lo.id]);
  });

  it("sorts by created date, newest first", () => {
    const older = makeTask({ created_at: "2026-06-01T00:00:00Z" });
    const newer = makeTask({ created_at: "2026-06-03T00:00:00Z" });
    const out = sortTasks([older, newer], "created");
    expect(out.map((t) => t.id)).toEqual([newer.id, older.id]);
  });

  it("does not mutate the input array", () => {
    const arr = [
      makeTask({ due_date: "2026-06-10" }),
      makeTask({ due_date: "2026-06-01" }),
    ];
    const before = arr.map((t) => t.id);
    sortTasks(arr, "due");
    expect(arr.map((t) => t.id)).toEqual(before);
  });
});

describe("groupTasks", () => {
  it("groups by status in fixed order and omits empty groups", () => {
    const todo = makeTask({ status: "todo" });
    const done = makeTask({ status: "done" });
    const groups = groupTasks([done, todo], "status", "created");
    expect(groups.map((g) => g.key)).toEqual(["status:todo", "status:done"]);
  });

  it("groups by priority in fixed order and omits empty groups", () => {
    const high = makeTask({ priority: "high" });
    const low = makeTask({ priority: "low" });
    const groups = groupTasks([low, high], "priority", "created");
    expect(groups.map((g) => g.key)).toEqual(["priority:high", "priority:low"]);
  });

  it("groups by due relative to today (overdue/today/upcoming/noDate/done)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T12:00:00Z"));
    const overdue = makeTask({ due_date: "2026-06-01" });
    const today = makeTask({ due_date: "2026-06-04" });
    const upcoming = makeTask({ due_date: "2026-06-10" });
    const noDate = makeTask({ due_date: null });
    const done = makeTask({ due_date: "2026-06-02", status: "done" });
    const groups = groupTasks(
      [upcoming, noDate, done, today, overdue],
      "due",
      "due",
    );
    expect(groups.map((g) => g.key)).toEqual([
      "due:overdue",
      "due:today",
      "due:upcoming",
      "due:noDate",
      "due:done",
    ]);
    expect(
      groups.find((g) => g.key === "due:overdue")?.tasks.map((t) => t.id),
    ).toEqual([overdue.id]);
  });
});

describe("tasksForGoal", () => {
  it("returns only tasks linked to the given goal, in input order", () => {
    const a = makeTask({ goal_id: "goal-1" });
    const b = makeTask({ goal_id: "goal-2" });
    const c = makeTask({ goal_id: "goal-1" });
    const d = makeTask({ goal_id: null });
    expect(tasksForGoal([a, b, c, d], "goal-1").map((t) => t.id)).toEqual([
      a.id,
      c.id,
    ]);
  });

  it("returns an empty array when no tasks are linked", () => {
    expect(tasksForGoal([makeTask({ goal_id: null })], "goal-x")).toEqual([]);
  });
});

describe("sortByPosition", () => {
  it("orders by position ascending with unpositioned tasks last", () => {
    const a = makeTask({ position: 2 });
    const b = makeTask({ position: 0 });
    const c = makeTask({ position: 1 });
    const olderNull = makeTask({ position: null, created_at: "2026-01-02T00:00:00Z" });
    const newerNull = makeTask({ position: null, created_at: "2026-01-05T00:00:00Z" });
    expect(
      sortByPosition([a, b, c, olderNull, newerNull]).map((t) => t.id),
    ).toEqual([b.id, c.id, a.id, newerNull.id, olderNull.id]);
  });

  it("does not mutate the input array", () => {
    const arr = [makeTask({ position: 1 }), makeTask({ position: 0 })];
    const before = arr.map((t) => t.id);
    sortByPosition(arr);
    expect(arr.map((t) => t.id)).toEqual(before);
  });
});

describe("moveId", () => {
  it("moves an id up and down to a target index", () => {
    expect(moveId(["a", "b", "c", "d"], "c", 1)).toEqual(["a", "c", "b", "d"]);
    expect(moveId(["a", "b", "c", "d"], "b", 2)).toEqual(["a", "c", "b", "d"]);
  });

  it("clamps out-of-range target indices", () => {
    expect(moveId(["a", "b", "c"], "a", 99)).toEqual(["b", "c", "a"]);
    expect(moveId(["a", "b", "c"], "c", -5)).toEqual(["c", "a", "b"]);
  });

  it("returns an unchanged copy when the id is missing", () => {
    const ids = ["a", "b"];
    const out = moveId(ids, "z", 0);
    expect(out).toEqual(["a", "b"]);
    expect(out).not.toBe(ids);
  });
});
