import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";

/**
 * Exports all of the signed-in user's data as a downloadable JSON file.
 * RLS scopes every query to the owner. (AIOS principle: users own their data.)
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const [profile, settings, tasks, goals, notes, brain] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("personal_tasks").select("*"),
    supabase.from("personal_goals").select("*"),
    supabase.from("personal_notes").select("*"),
    supabase.from("personal_brains").select("*"),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email },
    profile: profile.data ?? null,
    settings: settings.data ?? null,
    tasks: tasks.data ?? [],
    goals: goals.data ?? [],
    notes: notes.data ?? [],
    brain: brain.data ?? [],
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="aios-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
