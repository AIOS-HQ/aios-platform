import "server-only";
import { registerCapabilityHandler } from "@/lib/integrations/runtime/runtime";
import { calendarFetch } from "./client";

/** Google Calendar: list_events (read); create_event (routine); cancel_external_meeting (approval). */
interface CreateEventInput { event: Record<string, unknown>; }
interface EventRef { eventId: string; }
function requireToken(t: string | null): string { if (!t) throw new Error("Missing Google access token"); return t; }

let registered = false;
export function registerGoogleCalendarCapabilities(): void {
  if (registered) return;
  registered = true;
  registerCapabilityHandler("google_calendar", "list_events", async ({ accessToken }) =>
    calendarFetch(requireToken(accessToken), { path: "/calendars/primary/events?maxResults=50&orderBy=startTime&singleEvents=true" }));
  registerCapabilityHandler<CreateEventInput, unknown>("google_calendar", "create_event", async ({ accessToken, input }) =>
    calendarFetch(requireToken(accessToken), { method: "POST", path: "/calendars/primary/events", body: input.event }));
  registerCapabilityHandler<EventRef, unknown>("google_calendar", "cancel_external_meeting", async ({ accessToken, input }) =>
    calendarFetch(requireToken(accessToken), { method: "DELETE", path: `/calendars/primary/events/${input.eventId}` }));
}
