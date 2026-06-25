import type { ChannelKind } from "@/types/database";

/**
 * Ambassador — Business Communications specialist & virtual receptionist.
 *
 * This is a CAPABILITY profile, not a new system. Ambassador operates entirely
 * through the existing platform: channels are connected once in the Integration
 * Center, conversations live in Communications, risky replies route through
 * Approvals, and everything is supervised in Oversight. This module only
 * declares (a) which channels Ambassador covers and (b) the communication
 * safety policy used to decide what can send autonomously vs. what must wait
 * for the owner's approval.
 *
 * Pure + client-safe (no DB, no secrets) so both the server (the comms send
 * gate) and the UI (the workforce profile card) can import it.
 */

export interface AmbassadorChannel {
  /** Stable row id. */
  id: string;
  /** os.channelKind label key, when the channel maps to a comms ChannelKind. */
  labelKind?: ChannelKind;
  /** ambassador-namespace label key, for channels without a ChannelKind (Voice). */
  labelKey?: string;
  /** Integration Center connector id, when the channel maps to a connector. */
  connectorId?: string;
  /** Built into the platform (no external connector needed) — e.g. website chat. */
  native?: boolean;
  /** On the roadmap (SMS, Voice) — not yet connectable. */
  future?: boolean;
}

/**
 * The channels Ambassador handles. Connect a service once in the Integration
 * Center and Ambassador works it automatically — no per-channel setup.
 */
export const AMBASSADOR_CHANNELS: AmbassadorChannel[] = [
  { id: "whatsapp", labelKind: "whatsapp", connectorId: "whatsapp" },
  { id: "web_chat", labelKind: "web_chat", native: true },
  { id: "email", labelKind: "email", connectorId: "gmail" },
  { id: "linkedin", labelKind: "linkedin", connectorId: "linkedin" },
  { id: "messenger", labelKind: "facebook", connectorId: "messenger" },
  { id: "instagram", labelKind: "instagram", connectorId: "instagram" },
  { id: "sms", labelKind: "sms", future: true },
  { id: "voice", labelKey: "voice", future: true },
];

/**
 * High-risk communication topics. Per the business-safety policy these ALWAYS
 * require the owner's approval before a reply is sent — never auto-executed,
 * regardless of autonomy level. Matching errs toward caution (a false positive
 * just means "ask the owner"), honoring "when uncertain, escalate — never guess."
 */
export const AMBASSADOR_HIGH_RISK_TOPICS = [
  "pricing",
  "refunds",
  "contracts",
  "legal",
  "financial",
  "medical",
  "irreversible",
] as const;
export type AmbassadorRiskTopic = (typeof AMBASSADOR_HIGH_RISK_TOPICS)[number];

const RISK_KEYWORDS: Record<AmbassadorRiskTopic, string[]> = {
  pricing: ["price", "pricing", "quote", "discount", "how much", "% off", "percent off", "cost is", "costs "],
  refunds: ["refund", "money back", "reimburse", "chargeback"],
  contracts: ["contract", "agreement", "sign here", "terms and conditions", " nda", "sign the"],
  legal: ["legal", "lawsuit", "liability", "attorney", "lawyer", "sue ", "gdpr", "warranty", "guarantee"],
  financial: ["payment", "invoice", "bank ", "wire transfer", "deposit", "credit card", "financing", "pay now"],
  medical: ["medical", "diagnos", "prescri", "dosage", "symptom", "treatment", "health condition"],
  irreversible: ["cancel your account", "delete your account", "terminate", "permanently", "irreversible", "close your account"],
};

export interface CommunicationRisk {
  highRisk: boolean;
  topics: AmbassadorRiskTopic[];
}

/**
 * Classify an outbound reply's risk from its text. Deterministic + dependency-
 * free (no AI call, so it can never hallucinate a "safe" verdict). Used by the
 * comms send gate to force approval on high-risk content, and by the UI to show
 * the owner what Ambassador will always check first.
 */
export function classifyCommunicationRisk(text: string): CommunicationRisk {
  const haystack = ` ${(text ?? "").toLowerCase()} `;
  const topics: AmbassadorRiskTopic[] = [];
  for (const topic of AMBASSADOR_HIGH_RISK_TOPICS) {
    if (RISK_KEYWORDS[topic].some((kw) => haystack.includes(kw))) topics.push(topic);
  }
  return { highRisk: topics.length > 0, topics };
}

/** Virtual-receptionist behaviors (for display; the work runs through Comms). */
export const AMBASSADOR_RECEPTIONIST = ["greet", "route", "answer", "capture"] as const;
