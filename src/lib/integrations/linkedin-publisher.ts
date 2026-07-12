export type LinkedInPublisherIssueCode =
  | "missing_publisher_token"
  | "missing_organization"
  | "invalid_organization"
  | "invalid_token"
  | "organization_mismatch"
  | "organization_unreadable"
  | "network_error";

export interface LinkedInPublisherIssue {
  code: LinkedInPublisherIssueCode;
  message: string;
}

export interface LinkedInPublisherHealth {
  provider: "linkedin";
  mode: "organization_publisher";
  healthy: boolean;
  publisherConfigured: boolean;
  signInConfigured: boolean;
  organization: {
    id: string | null;
    urn: string | null;
    name: string | null;
  };
  permissions: {
    organizationPublish: boolean;
    organizationRead: boolean;
  };
  token: {
    present: boolean;
    valid: boolean;
    expiresAt: string | null;
  };
  apiVersion: string;
  capabilities: {
    textPost: true;
    documentCarousel: false;
  };
  issues: LinkedInPublisherIssue[];
}

export interface LinkedInPublisherPreflight {
  ok: boolean;
  author: string | null;
  apiVersion: string;
  health: LinkedInPublisherHealth;
}

export const LINKEDIN_DEFAULT_API_VERSION = "202604";

function apiVersion(): string {
  return (process.env.LINKEDIN_API_VERSION || LINKEDIN_DEFAULT_API_VERSION).trim();
}

export function redactLinkedInSecret(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? "[redacted]" : "";
}

export function redactLinkedInDiagnostics(value: string): string {
  let redacted = value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
  const token = process.env.LINKEDIN_PUBLISHER_ACCESS_TOKEN;
  if (token) redacted = redacted.split(token).join("[redacted]");
  return redacted;
}

export function normalizeLinkedInOrganization(value?: string | null): {
  id: string;
  urn: string;
} | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  if (/^urn:li:organization:\d+$/.test(raw)) {
    const id = raw.slice("urn:li:organization:".length);
    return { id, urn: raw };
  }
  if (/^\d+$/.test(raw)) return { id: raw, urn: `urn:li:organization:${raw}` };
  const match =
    raw.match(/organization[:/](\d+)/i) || raw.match(/company\/(\d+)/i);
  if (!match) return null;
  return { id: match[1], urn: `urn:li:organization:${match[1]}` };
}

export function resolveApprovedLinkedInOrganization(): {
  id: string;
  urn: string;
} | null {
  return (
    normalizeLinkedInOrganization(process.env.LINKEDIN_ORGANIZATION_URN) ??
    normalizeLinkedInOrganization(process.env.LINKEDIN_ORGANIZATION_ID)
  );
}

function baseHealth(): LinkedInPublisherHealth {
  const org = resolveApprovedLinkedInOrganization();
  return {
    provider: "linkedin",
    mode: "organization_publisher",
    healthy: false,
    publisherConfigured: Boolean(process.env.LINKEDIN_PUBLISHER_ACCESS_TOKEN),
    signInConfigured: Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
    organization: {
      id: org?.id ?? null,
      urn: org?.urn ?? null,
      name: null,
    },
    permissions: {
      organizationPublish: false,
      organizationRead: false,
    },
    token: {
      present: Boolean(process.env.LINKEDIN_PUBLISHER_ACCESS_TOKEN),
      valid: false,
      expiresAt: null,
    },
    apiVersion: apiVersion(),
    capabilities: {
      textPost: true,
      documentCarousel: false,
    },
    issues: [],
  };
}

function issue(code: LinkedInPublisherIssueCode, message: string): LinkedInPublisherIssue {
  return { code, message };
}

function linkedinHeaders(token: string, version: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "LinkedIn-Version": version,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

function orgNameFromPayload(payload: Record<string, unknown>): string | null {
  const localizedName = payload.localizedName;
  if (typeof localizedName === "string" && localizedName.trim()) return localizedName;
  const name = payload.name;
  if (typeof name === "string" && name.trim()) return name;
  if (name && typeof name === "object") {
    const localized = (name as Record<string, unknown>).localized;
    if (localized && typeof localized === "object") {
      const first = Object.values(localized).find((v) => typeof v === "string" && v.trim());
      if (typeof first === "string") return first;
    }
  }
  return null;
}

export async function getLinkedInPublisherHealth(): Promise<LinkedInPublisherHealth> {
  const health = baseHealth();
  const org = resolveApprovedLinkedInOrganization();
  const token = process.env.LINKEDIN_PUBLISHER_ACCESS_TOKEN;

  if (!token) {
    health.issues.push(
      issue(
        "missing_publisher_token",
        "LINKEDIN_PUBLISHER_ACCESS_TOKEN is required for LinkedIn organization publishing.",
      ),
    );
  }

  if (!org) {
    health.issues.push(
      issue(
        "missing_organization",
        "LINKEDIN_ORGANIZATION_URN or LINKEDIN_ORGANIZATION_ID is required and must identify the approved organization.",
      ),
    );
  }

  if (!token || !org) return health;

  try {
    const response = await fetch(`https://api.linkedin.com/rest/organizations/${org.id}`, {
      method: "GET",
      headers: linkedinHeaders(token, health.apiVersion),
    });

    if (response.status === 401) {
      health.issues.push(issue("invalid_token", "LinkedIn rejected the publisher access token."));
      return health;
    }

    if (response.status === 403) {
      health.token.valid = true;
      health.issues.push(
        issue(
          "organization_unreadable",
          "Publisher token is accepted but cannot read the configured organization.",
        ),
      );
      return health;
    }

    if (!response.ok) {
      health.issues.push(
        issue(
          "organization_unreadable",
          `LinkedIn organization verification failed with status ${response.status}.`,
        ),
      );
      return health;
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const responseId =
      typeof payload.id === "number"
        ? String(payload.id)
        : typeof payload.id === "string"
          ? payload.id
          : org.id;
    const responseOrg = normalizeLinkedInOrganization(responseId);

    health.token.valid = true;
    health.permissions.organizationRead = true;
    health.organization.name = orgNameFromPayload(payload);

    if (!responseOrg || responseOrg.id !== org.id) {
      health.issues.push(
        issue(
          "organization_mismatch",
          "LinkedIn returned an organization that does not match the configured publisher organization.",
        ),
      );
      return health;
    }

    health.permissions.organizationPublish = true;
    health.healthy = true;
    return health;
  } catch {
    health.issues.push(
      issue("network_error", "LinkedIn publisher verification could not reach LinkedIn."),
    );
    return health;
  }
}

export async function preflightLinkedInPublisher(
  channelHandle?: string | null,
): Promise<LinkedInPublisherPreflight> {
  const health = await getLinkedInPublisherHealth();
  const approved = resolveApprovedLinkedInOrganization();
  const channelOrg = normalizeLinkedInOrganization(channelHandle);

  if (channelOrg && approved && channelOrg.id !== approved.id) {
    health.healthy = false;
    health.permissions.organizationPublish = false;
    health.issues.push(
      issue(
        "organization_mismatch",
        "Connected LinkedIn channel handle does not match the approved publisher organization.",
      ),
    );
  }

  return {
    ok: health.healthy,
    author: approved?.urn ?? null,
    apiVersion: health.apiVersion,
    health,
  };
}
