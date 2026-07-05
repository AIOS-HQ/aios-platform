import "server-only";
import { registerCapabilityHandler } from "@/lib/integrations/runtime/runtime";
import { googleFetch, requireToken } from "../google/api";

/**
 * Google Sheets provider client. Capabilities mirror the registry:
 * read_sheet (read), append_rows (routine), update_range (approval).
 * Sheets REST API v4: https://developers.google.com/sheets/api/reference/rest
 */
const SHEETS_API = "https://sheets.googleapis.com/v4";

interface ReadSheet { spreadsheetId: string; range: string; }
interface AppendRows { spreadsheetId: string; range: string; values: unknown[][]; }
interface UpdateRange { spreadsheetId: string; range: string; values: unknown[][]; }

function valuesPath(spreadsheetId: string, range: string, suffix = ""): string {
  return `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}${suffix}`;
}

let registered = false;
export function registerGoogleSheetsCapabilities(): void {
  if (registered) return;
  registered = true;

  registerCapabilityHandler<ReadSheet, unknown>("google_sheets", "read_sheet", async ({ accessToken, input }) =>
    googleFetch(SHEETS_API, requireToken(accessToken), { path: valuesPath(input.spreadsheetId, input.range) }));

  registerCapabilityHandler<AppendRows, unknown>("google_sheets", "append_rows", async ({ accessToken, input }) =>
    googleFetch(SHEETS_API, requireToken(accessToken), {
      method: "POST",
      path: valuesPath(input.spreadsheetId, input.range, ":append?valueInputOption=USER_ENTERED"),
      body: { values: input.values },
    }));

  registerCapabilityHandler<UpdateRange, unknown>("google_sheets", "update_range", async ({ accessToken, input }) =>
    googleFetch(SHEETS_API, requireToken(accessToken), {
      method: "PUT",
      path: valuesPath(input.spreadsheetId, input.range, "?valueInputOption=USER_ENTERED"),
      body: { values: input.values },
    }));
}
