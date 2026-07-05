import "server-only";
import { registerCapabilityHandler } from "@/lib/integrations/runtime/runtime";
import { hubspotFetch } from "./client";

/** HubSpot: list_contacts (read); create_contact (routine); delete_contact (destructive). */
interface CreateContactInput { properties: Record<string, unknown>; }
interface ContactRef { contactId: string; }
function requireToken(t: string | null): string { if (!t) throw new Error("Missing HubSpot access token"); return t; }

let registered = false;
export function registerHubspotCapabilities(): void {
  if (registered) return;
  registered = true;
  registerCapabilityHandler("hubspot", "list_contacts", async ({ accessToken }) =>
    hubspotFetch(requireToken(accessToken), { path: "/crm/v3/objects/contacts?limit=100" }));
  registerCapabilityHandler<CreateContactInput, unknown>("hubspot", "create_contact", async ({ accessToken, input }) =>
    hubspotFetch(requireToken(accessToken), { method: "POST", path: "/crm/v3/objects/contacts", body: { properties: input.properties } }));
  registerCapabilityHandler<ContactRef, unknown>("hubspot", "delete_contact", async ({ accessToken, input }) =>
    hubspotFetch(requireToken(accessToken), { method: "DELETE", path: `/crm/v3/objects/contacts/${input.contactId}` }));
}
