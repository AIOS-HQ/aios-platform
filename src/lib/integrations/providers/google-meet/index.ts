import "server-only";
import { registerCapabilityHandler } from "@/lib/integrations/runtime/runtime";
import { googleFetch, requireToken } from "../google/api";

/**
 * Google Meet provider client. Capabilities mirror the registry:
 * list_conferences (read), create_meeting (routine).
 * Meet REST API v2: https://developers.google.com/meet/api/reference/rest
 */
const MEET_API = "https://meet.googleapis.com/v2";

let registered = false;
export function registerGoogleMeetCapabilities(): void {
  if (registered) return;
  registered = true;

  registerCapabilityHandler<unknown, unknown>("google_meet", "list_conferences", async ({ accessToken }) =>
    googleFetch(MEET_API, requireToken(accessToken), { path: "/conferenceRecords" }));

  // Creating a Meet "space" yields a fresh meeting link the workforce can share.
  registerCapabilityHandler<unknown, unknown>("google_meet", "create_meeting", async ({ accessToken }) =>
    googleFetch(MEET_API, requireToken(accessToken), { method: "POST", path: "/spaces", body: {} }));
}
