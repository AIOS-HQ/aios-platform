import "server-only";

import { registerCapabilityHandler } from "@/lib/integrations/runtime/runtime";
import { jiraFetch } from "./client";

/** Jira capabilities: list_issues (read); create_issue (routine); transition_issue (approval). */
interface ListIssuesInput {
  cloudId: string;
  jql?: string;
}
interface CreateIssueInput {
  cloudId: string;
  projectKey: string;
  summary: string;
  issueType?: string;
}
interface TransitionIssueInput {
  cloudId: string;
  issueKey: string;
  transitionId: string;
}

function requireToken(token: string | null): string {
  if (!token) throw new Error("Missing Jira access token");
  return token;
}

let registered = false;

export function registerJiraCapabilities(): void {
  if (registered) return;
  registered = true;

  registerCapabilityHandler<ListIssuesInput, unknown>("jira", "list_issues", async ({ accessToken, input }) =>
    jiraFetch(requireToken(accessToken), input.cloudId, {
      path: `/search?jql=${encodeURIComponent(input.jql ?? "order by created DESC")}&maxResults=50`,
    }),
  );
  registerCapabilityHandler<CreateIssueInput, unknown>("jira", "create_issue", async ({ accessToken, input }) =>
    jiraFetch(requireToken(accessToken), input.cloudId, {
      method: "POST",
      path: "/issue",
      body: {
        fields: {
          project: { key: input.projectKey },
          summary: input.summary,
          issuetype: { name: input.issueType ?? "Task" },
        },
      },
    }),
  );
  registerCapabilityHandler<TransitionIssueInput, unknown>("jira", "transition_issue", async ({ accessToken, input }) =>
    jiraFetch(requireToken(accessToken), input.cloudId, {
      method: "POST",
      path: `/issue/${input.issueKey}/transitions`,
      body: { transition: { id: input.transitionId } },
    }),
  );
}
