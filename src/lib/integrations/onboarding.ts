/**
 * Harmony Smart Onboarding — the recommendation engine.
 *
 * Client-safe, pure, and extensible. Turns a non-technical business owner's
 * answers (their BusinessProfile) into a recommended set of connectors drawn
 * from the existing connector registry (src/lib/integrations/connectors.ts).
 * No secrets, no I/O, no duplicate connector definitions — just the mapping
 * from "what kind of business is this" to "what should we connect."
 *
 * Adding a new business type or a new connector requires only a data edit here;
 * every connector automatically inherits the same onboarding framework.
 */

export type BusinessType =
  | "restaurant"
  | "professional_office"
  | "ecommerce"
  | "medical"
  | "construction"
  | "retail"
  | "agency"
  | "other";

export type ContactChannel =
  | "whatsapp"
  | "email"
  | "phone"
  | "web_chat"
  | "social";

export interface BusinessProfile {
  businessType: BusinessType;
  /** Free bucket, e.g. "1" | "2-10" | "11-50" | "50+". */
  employees?: string;
  /** How customers mostly reach the business. */
  contactChannels: ContactChannel[];
  usesCrm: boolean;
  acceptsPayments: boolean;
  hasDevices: boolean;
  /** BCP-47-ish language codes the business serves, e.g. ["en", "es"]. */
  languages: string[];
  /** AI provider connector ids the owner wants, e.g. ["openai"]. */
  aiProviders: string[];
}

export const BUSINESS_TYPES: BusinessType[] = [
  "restaurant",
  "professional_office",
  "ecommerce",
  "medical",
  "construction",
  "retail",
  "agency",
  "other",
];

/**
 * Base recommendations per business type (connector ids from the registry).
 * Extensible: add a type here and Smart Onboarding picks it up automatically.
 */
export const BUSINESS_TYPE_RECOMMENDATIONS: Record<BusinessType, string[]> = {
  restaurant: ["whatsapp", "printer", "google_calendar"],
  professional_office: ["microsoft_365", "outlook", "teams"],
  ecommerce: ["shopify", "stripe", "whatsapp"],
  medical: ["microsoft_365", "printer", "scanner"],
  construction: ["whatsapp", "google_workspace", "google_drive"],
  retail: ["stripe", "whatsapp", "printer"],
  agency: ["google_workspace", "slack", "hubspot"],
  other: ["gmail", "google_calendar"],
};

/** Connector ids grouped by the onboarding "connect" steps. */
export const COMMUNICATION_CONNECTOR_IDS = [
  "whatsapp",
  "gmail",
  "outlook",
  "messenger",
  "instagram",
  "teams",
  "slack",
];
export const BUSINESS_CONNECTOR_IDS = [
  "stripe",
  "shopify",
  "hubspot",
  "salesforce",
  "quickbooks",
];
export const CALENDAR_CONNECTOR_IDS = ["google_calendar", "outlook_calendar"];
export const DEVICE_CONNECTOR_IDS = [
  "printer",
  "scanner",
  "fax",
  "multifunction_device",
  "network_storage",
];
export const AI_CONNECTOR_IDS = ["openai", "anthropic", "gemini"];

/**
 * Build the recommended connector id set from a business profile: the
 * business-type baseline plus answer-driven additions. Order-stable and
 * deduplicated. Pure — safe to call on the client as answers change.
 */
export function recommendConnectors(profile: BusinessProfile): string[] {
  const set = new Set<string>(
    BUSINESS_TYPE_RECOMMENDATIONS[profile.businessType] ?? [],
  );

  for (const channel of profile.contactChannels) {
    if (channel === "whatsapp") set.add("whatsapp");
    if (channel === "email") set.add("gmail");
    if (channel === "social") {
      set.add("instagram");
      set.add("messenger");
    }
    // "phone" and "web_chat" are handled natively by Communications.
  }

  if (profile.acceptsPayments) set.add("stripe");
  if (profile.usesCrm) set.add("hubspot");
  if (profile.hasDevices) {
    set.add("printer");
    set.add("scanner");
  }
  for (const ai of profile.aiProviders) {
    if (AI_CONNECTOR_IDS.includes(ai)) set.add(ai);
  }

  return [...set];
}

/** Split recommended ids into the onboarding connect groups (for the wizard). */
export function groupRecommendations(ids: string[]): {
  communication: string[];
  business: string[];
  calendar: string[];
  device: string[];
  ai: string[];
} {
  const inGroup = (group: string[]) => ids.filter((id) => group.includes(id));
  return {
    communication: inGroup(COMMUNICATION_CONNECTOR_IDS),
    business: inGroup(BUSINESS_CONNECTOR_IDS),
    calendar: inGroup(CALENDAR_CONNECTOR_IDS),
    device: inGroup(DEVICE_CONNECTOR_IDS),
    ai: inGroup(AI_CONNECTOR_IDS),
  };
}
