import { describe, it, expect, afterEach, vi } from "vitest";

// `tasks.ts` imports the server Supabase client, which transitively pulls in
// `next/headers` — not loadable in a plain Node test runtime. Mock it so the
// module's pure helper (`todayTasks`) can be imported and tested in isolation.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { todayTasks } from "@/lib/data/tasks";
import { makeTask } from "../helpers/factories";

afterEach(() => {
  vi.useRealTimers();
});

describe("todayTasks", () => {
  it("keeps open tasks due today or earlier, sorted by due date ascending", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T12:00:00Z"));
    const overdue = makeTask({ due_date: "2026-06-01" });
    const today = makeTask({ due_date: "2026-06-04" });
    const future = makeTask({ due_date: "2026-06-10" });
    const noDate = makeTask({ due_date: null });
    const doneOverdue = makeTask({ due_date: "2026-06-02", status: "done" });

    const out = todayTasks([future, today, overdue, noDate, doneOverdue]);
    expect(out.map((t) => t.id)).toEqual([overdue.id, today.id]);
  });

  it("returns an empty array when nothing is due yet", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T12:00:00Z"));
    const out = todayTasks([
      makeTask({ due_date: "2026-12-31" }),
      makeTask({ due_date: null }),
    ]);
    expect(out).toEqual([]);
  });
});
