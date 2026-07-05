import "server-only";

import { registerCapabilityHandler } from "@/lib/integrations/runtime/runtime";
import { linearGraphQL } from "./client";

/**
 * Linear capability implementation (Group B.2) — mirrors the GitHub reference.
 * Registry capabilities: list_issues (read); create_issue (routine write);
 * update_issue (approval-gated). Runtime owns auth/retry/telemetry/governance.
 */

interface CreateIssueInput {
  teamId: string;
  title: string;
  description?: string;
}
interface UpdateIssueInput {
  issueId: string;
  title?: string;
  description?: string;
  stateId?: string;
}

function requireToken(token: string | null): string {
  if (!token) throw new Error("Missing Linear access token");
  return token;
}

const LIST_ISSUES = `query { issues(first: 50) { nodes { id identifier title state { name } } } }`;
const CREATE_ISSUE = `mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier } } }`;
const UPDATE_ISSUE = `mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`;

let registered = false;

export function registerLinearCapabilities(): void {
  if (registered) return;
  registered = true;

  registerCapabilityHandler("linear", "list_issues", async ({ accessToken }) =>
    linearGraphQL(requireToken(accessToken), LIST_ISSUES),
  );
  registerCapabilityHandler<CreateIssueInput, unknown>("linear", "create_issue", async ({ accessToken, input }) =>
    linearGraphQL(requireToken(accessToken), CREATE_ISSUE, {
      input: { teamId: input.teamId, title: input.title, description: input.description },
    }),
  );
  registerCapabilityHandler<UpdateIssueInput, unknown>("linear", "update_issue", async ({ accessToken, input }) =>
    linearGraphQL(requireToken(accessToken), UPDATE_ISSUE, {
      id: input.issueId,
      input: { title: input.title, description: input.description, stateId: input.stateId },
    }),
  );
}
