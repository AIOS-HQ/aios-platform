import "server-only";
import { registerCapabilityHandler } from "@/lib/integrations/runtime/runtime";
import { googleFetch, requireToken } from "../google/api";

/**
 * Google Docs provider client. Capabilities mirror the registry:
 * read_document (read), create_document (routine), edit_document (approval).
 * Docs REST API v1: https://developers.google.com/docs/api/reference/rest
 */
const DOCS_API = "https://docs.googleapis.com/v1";

interface DocRef { documentId: string; }
interface CreateDoc { title: string; }
interface EditDoc { documentId: string; requests: unknown[]; }

let registered = false;
export function registerGoogleDocsCapabilities(): void {
  if (registered) return;
  registered = true;

  registerCapabilityHandler<DocRef, unknown>("google_docs", "read_document", async ({ accessToken, input }) =>
    googleFetch(DOCS_API, requireToken(accessToken), { path: `/documents/${encodeURIComponent(input.documentId)}` }));

  registerCapabilityHandler<CreateDoc, unknown>("google_docs", "create_document", async ({ accessToken, input }) =>
    googleFetch(DOCS_API, requireToken(accessToken), { method: "POST", path: "/documents", body: { title: input.title } }));

  registerCapabilityHandler<EditDoc, unknown>("google_docs", "edit_document", async ({ accessToken, input }) =>
    googleFetch(DOCS_API, requireToken(accessToken), {
      method: "POST",
      path: `/documents/${encodeURIComponent(input.documentId)}:batchUpdate`,
      body: { requests: input.requests },
    }));
}
