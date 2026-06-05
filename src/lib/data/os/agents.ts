import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Agent } from "@/types/database";

/** List the agents in a department. */
export async function listAgents(departmentId: string): Promise<Agent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("department_id", departmentId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) console.error("[data/os/agents] listAgents", error);
  return (data as Agent[] | null) ?? [];
}

/** All of the owner's agents (for assignment pickers). */
export async function listAllAgents(): Promise<Agent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .order("position", { ascending: true });
  if (error) console.error("[data/os/agents] listAllAgents", error);
  return (data as Agent[] | null) ?? [];
}
