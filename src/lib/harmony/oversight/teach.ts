/**
 * Teach Harmony — the categories an owner can classify a rule under. Kept in a
 * plain module (NOT the "use server" actions file, which may only export async
 * functions) so both the server action and the UI can import these constants.
 */
export const TEACH_CATEGORIES = [
  "company_policy",
  "communication_preference",
  "customer_service_rule",
  "operational_guideline",
] as const;

export type TeachCategory = (typeof TEACH_CATEGORIES)[number];
