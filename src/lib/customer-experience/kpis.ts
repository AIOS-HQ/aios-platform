import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEventMeshOperationsSummary } from "@/lib/event-mesh/operations";

export type KpiStatus = "pass" | "warn" | "configuration_required" | "not_tracked";

export interface CustomerKpi {
  id: string;
  label: string;
  value: number | string;
  status: KpiStatus;
  source: string;
  detail: string;
}

export interface CustomerExperienceSnapshot {
  generatedAt: string;
  adminClientAvailable: boolean;
  acquisition: CustomerKpi[];
  activation: CustomerKpi[];
  engagement: CustomerKpi[];
  retention: CustomerKpi[];
  reliability: CustomerKpi[];
  conversion: CustomerKpi[];
  privacyControls: string[];
  founderActions: string[];
}

type UserIdRow = { user_id?: string | null };

function metric(
  id: string,
  label: string,
  value: number | string,
  status: KpiStatus,
  source: string,
  detail: string,
): CustomerKpi {
  return { id, label, value, status, source, detail };
}

function unavailableSnapshot(reason: string): CustomerExperienceSnapshot {
  const unavailable = metric(
    "admin_client",
    "Cross-user aggregate access",
    "Unavailable",
    "configuration_required",
    "SUPABASE_SERVICE_ROLE_KEY",
    reason,
  );
  return {
    generatedAt: new Date().toISOString(),
    adminClientAvailable: false,
    acquisition: [unavailable],
    activation: [],
    engagement: [],
    retention: [],
    reliability: [],
    conversion: [],
    privacyControls: privacyControls(),
    founderActions: [
      "Set SUPABASE_SERVICE_ROLE_KEY in the verified AIOS environment to enable aggregate Founder dashboards.",
    ],
  };
}

async function countQuery(
  promise: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number | null> {
  const { count, error } = await promise;
  if (error) {
    console.error("[customer-experience] count", error.message);
    return null;
  }
  return count ?? 0;
}

function uniqueUsers(rows: UserIdRow[]): number {
  return new Set(rows.map((row) => row.user_id).filter(Boolean)).size;
}

async function activeUsersSince(sinceIso: string): Promise<number | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const [tasks, goals, notes, connections] = await Promise.all([
    admin.from("personal_tasks").select("user_id").gte("updated_at", sinceIso).limit(5000),
    admin.from("personal_goals").select("user_id").gte("updated_at", sinceIso).limit(5000),
    admin.from("personal_notes").select("user_id").gte("updated_at", sinceIso).limit(5000),
    admin.from("integration_connections").select("user_id").gte("updated_at", sinceIso).limit(5000),
  ]);
  for (const result of [tasks, goals, notes, connections]) {
    if (result.error) {
      console.error("[customer-experience] active users", result.error.message);
      return null;
    }
  }
  return uniqueUsers([
    ...((tasks.data ?? []) as UserIdRow[]),
    ...((goals.data ?? []) as UserIdRow[]),
    ...((notes.data ?? []) as UserIdRow[]),
    ...((connections.data ?? []) as UserIdRow[]),
  ]);
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function getCustomerExperienceSnapshot(): Promise<CustomerExperienceSnapshot> {
  const admin = createAdminClient();
  if (!admin) {
    return unavailableSnapshot("Service-role admin client is unavailable; cannot compute aggregate customer KPIs safely.");
  }

  const [
    registeredCustomers,
    profilePhotos,
    tasksCreated,
    tasksCompleted,
    goalsCreated,
    notesCreated,
    personalBrains,
    connectedIntegrations,
    unresolvedOps,
    failedActions,
    activeSubscriptions,
    canceledSubscriptions,
    dau,
    wau,
    mau,
    eventMesh,
  ] = await Promise.all([
    countQuery(admin.from("profiles").select("id", { count: "exact", head: true }).neq("role", "admin")),
    countQuery(admin.from("profiles").select("id", { count: "exact", head: true }).not("profile_photo_path", "is", null)),
    countQuery(admin.from("personal_tasks").select("id", { count: "exact", head: true })),
    countQuery(admin.from("personal_tasks").select("id", { count: "exact", head: true }).eq("status", "done")),
    countQuery(admin.from("personal_goals").select("id", { count: "exact", head: true })),
    countQuery(admin.from("personal_notes").select("id", { count: "exact", head: true })),
    countQuery(admin.from("personal_brains").select("id", { count: "exact", head: true })),
    countQuery(admin.from("integration_connections").select("id", { count: "exact", head: true }).eq("status", "connected")),
    countQuery(admin.from("ops_events").select("id", { count: "exact", head: true }).eq("resolved", false)),
    countQuery(admin.from("agent_actions").select("id", { count: "exact", head: true }).eq("status", "failed")),
    countQuery(admin.from("subscriptions").select("id", { count: "exact", head: true }).in("status", ["active", "trialing"])),
    countQuery(admin.from("subscriptions").select("id", { count: "exact", head: true }).in("status", ["canceled", "unpaid"])),
    activeUsersSince(daysAgo(1)),
    activeUsersSince(daysAgo(7)),
    activeUsersSince(daysAgo(30)),
    getEventMeshOperationsSummary(),
  ]);

  const safe = (value: number | null) => value ?? "Unavailable";

  return {
    generatedAt: new Date().toISOString(),
    adminClientAvailable: true,
    acquisition: [
      metric("registered_customers", "Registered customers", safe(registeredCustomers), "pass", "profiles", "Admin profiles are excluded."),
      metric("verified_accounts", "Verified accounts", "Not tracked", "not_tracked", "auth.users", "Email verification is not exposed through the current aggregate schema."),
      metric("failed_signups", "Failed signup attempts", "Not tracked", "not_tracked", "auth logs", "Auth failure telemetry is not persisted in AIOS tables yet."),
    ],
    activation: [
      metric("onboarding_completed", "Onboarding completed", "Not tracked", "not_tracked", "Subscriber onboarding", "The current guided onboarding flow does not persist completion state."),
      metric("profile_photos", "Profile photos saved", safe(profilePhotos), "pass", "profiles.profile_photo_path", "Counts saved paths only, not image contents."),
      metric("first_task_proxy", "Tasks created", safe(tasksCreated), "pass", "personal_tasks", "Durable task records indicate activation of the task workflow."),
      metric("first_goal_proxy", "Goals created", safe(goalsCreated), "pass", "personal_goals", "Durable goal records indicate activation of the goal workflow."),
      metric("first_note_proxy", "Notes created", safe(notesCreated), "pass", "personal_notes", "Founder dashboards never show note content."),
      metric("first_integration_proxy", "Connected integrations", safe(connectedIntegrations), "pass", "integration_connections", "Counts connected rows only; tokens are never selected."),
    ],
    engagement: [
      metric("dau", "Daily active users", safe(dau), dau === null ? "configuration_required" : "pass", "personal tables", "Unique users with task, goal, note, or integration updates in the last 24 hours."),
      metric("wau", "Weekly active users", safe(wau), wau === null ? "configuration_required" : "pass", "personal tables", "Unique users with durable activity in the last 7 days."),
      metric("mau", "Monthly active users", safe(mau), mau === null ? "configuration_required" : "pass", "personal tables", "Unique users with durable activity in the last 30 days."),
      metric("tasks_completed", "Tasks completed", safe(tasksCompleted), "pass", "personal_tasks", "Completion count only."),
      metric("memory_records", "Memory records", safe(personalBrains), "pass", "personal_brains", "Counts memory records without content."),
    ],
    retention: [
      metric("returning_users", "Returning users", safe(wau), wau === null ? "configuration_required" : "pass", "personal tables", "Weekly active users are the current retention proxy."),
      metric("inactive_users", "Inactive users", registeredCustomers !== null && mau !== null ? Math.max(registeredCustomers - mau, 0) : "Unavailable", registeredCustomers !== null && mau !== null ? "warn" : "configuration_required", "profiles + personal tables", "Customers without durable activity in the last 30 days."),
    ],
    reliability: [
      metric("unresolved_ops", "Unresolved customer-impacting issues", safe(unresolvedOps), unresolvedOps && unresolvedOps > 0 ? "warn" : "pass", "ops_events", "Metadata only; no customer content."),
      metric("failed_actions", "Failed server/agent actions", safe(failedActions), failedActions && failedActions > 0 ? "warn" : "pass", "agent_actions", "Failure metadata only."),
      metric("event_mesh_dead_letters", "Event Mesh dead letters", eventMesh.deadLetters, eventMesh.deadLetters > 0 ? "warn" : "pass", "event_mesh", "Postgres adapter summary."),
    ],
    conversion: [
      metric("pricing_cta", "Pricing CTA clicks", "Not tracked", "not_tracked", "public website", "CTA click analytics provider is not configured."),
      metric("active_or_trialing_subscriptions", "Active/trialing subscriptions", safe(activeSubscriptions), "pass", "subscriptions", "Billing rows only when Stripe is configured."),
      metric("canceled_or_unpaid_subscriptions", "Canceled/unpaid subscriptions", safe(canceledSubscriptions), canceledSubscriptions && canceledSubscriptions > 0 ? "warn" : "pass", "subscriptions", "Billing rows only when Stripe is configured."),
    ],
    privacyControls: privacyControls(),
    founderActions: [
      "Persist subscriber onboarding completion to replace the current not-tracked onboarding KPI.",
      "Configure a lawful analytics provider before displaying page views, CTA clicks, conversion rates, or cohorts.",
      "Keep Founder support drill-downs audited and limited to authorized support use.",
    ],
  };
}

export function privacyControls(): string[] {
  return [
    "Founder dashboards aggregate by default.",
    "Private note, memory, prompt, message, and file contents are not queried for KPI display.",
    "Small-cohort and drill-down support workflows must remain authorized and auditable.",
    "Integration dashboards display connection health and provider identity, never tokens or raw credentials.",
  ];
}
