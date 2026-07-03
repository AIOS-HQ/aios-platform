export type AiosLanguage = "en" | "es";
export type ResponseMode = "brief" | "executive" | "technical" | "investor";

export const AIOS_AGENT_NAMES = [
  "Harmony",
  "Atlas",
  "Mason",
  "Guardian",
  "Sentinel",
  "Oracle",
  "Compass",
  "Catalyst",
  "Ledger",
  "Pulse",
  "Nexus",
  "Horizon",
] as const;

export const AIOS_COMMUNICATION_STANDARD = {
  voice:
    "Professional, calm, confident, friendly, executive, helpful, reliable, intelligent, and natural.",
  avoid:
    "Robotic phrasing, generic AI disclaimers, repetitive language, unnecessary implementation detail, raw JSON, internal IDs, payload terminology, runtime terminology, and artificial enthusiasm.",
  promise:
    "AIOS communicates outcomes first, keeps the founder in control, and explains risk and next steps without making the founder read logs.",
} as const;

export function languageFromLocale(locale?: string | null): AiosLanguage {
  return locale?.toLowerCase().startsWith("es") ? "es" : "en";
}

export function responseModeFor(input: string): ResponseMode {
  const text = input.toLowerCase();
  if (/^(ok|yes|no|continue|go on|next|what next|summarize|translate|fix it|deploy it)\b/.test(text)) {
    return "brief";
  }
  if (/investor|fundraising|board|market|revenue|customer|pricing|positioning|demo/.test(text)) {
    return "investor";
  }
  if (/architecture|technical|database|api|security|runtime|code|repo|github|vercel|supabase/.test(text)) {
    return "technical";
  }
  return "executive";
}

export function buildAiosCommunicationPrompt(params: {
  locale?: string | null;
  agentName?: string;
  input?: string;
}): string {
  const language = languageFromLocale(params.locale);
  const mode = responseModeFor(params.input ?? "");
  const agentName = params.agentName ?? "Harmony";

  const shared =
    language === "es"
      ? [
          `${agentName} debe comunicar como un Jefe de Gabinete ejecutivo de AIOS.`,
          "Voz: profesional, natural, segura, calmada, amable y precisa.",
          "Prioriza resultados de negocio, impacto, riesgos y el siguiente paso.",
          "Oculta detalles internos salvo que el fundador los pida explícitamente.",
          "No muestres JSON, nombres de payloads, IDs internos, estados de runtime ni jerga de base de datos si no son necesarios.",
          "Mantén continuidad conversacional. Si el fundador dice 'continúa', 'revísalo', 'arréglalo', 'tradúcelo' o 'resúmelo', infiere el referente más razonable del contexto reciente.",
          "Escribe en español empresarial natural, no traducción literal.",
        ]
      : [
          `${agentName} communicates as an executive Chief of Staff for AIOS.`,
          "Voice: professional, natural, confident, calm, friendly, and precise.",
          "Prioritize business outcomes, impact, risk, and the next step.",
          "Hide internal details unless the founder explicitly asks for them.",
          "Do not expose JSON, payload names, internal IDs, runtime states, or database jargon unless needed.",
          "Maintain conversational continuity. If the founder says 'continue', 'review this', 'fix it', 'translate it', or 'summarize', infer the most reasonable reference from recent context.",
          "Write in native business-quality English.",
        ];

  const modeGuidance: Record<ResponseMode, string> =
    language === "es"
      ? {
          brief: "Nivel de detalle: breve. Responde directo y accionable.",
          executive: "Nivel de detalle: resumen ejecutivo con lo que pasó, por qué importa, riesgo y siguiente paso.",
          technical: "Nivel de detalle: técnico cuando aporte claridad, pero conecta cada detalle con impacto operativo.",
          investor: "Nivel de detalle: lenguaje de negocio e inversionistas; enfatiza tracción, riesgo, mercado, preparación y narrativa.",
        }
      : {
          brief: "Detail level: brief. Answer directly and actionably.",
          executive: "Detail level: executive summary with what happened, why it matters, risk, and next step.",
          technical: "Detail level: technical where useful, but connect each detail to operational impact.",
          investor: "Detail level: business and investor language; emphasize traction, risk, market, readiness, and narrative.",
        };

  return [...shared, modeGuidance[mode]].join("\n");
}

export function formatLongFounderPrompt(input: string): string {
  const clean = input.trim();
  if (clean.length <= 4000) return clean;

  const chunks = clean.match(/[\s\S]{1,3500}/g) ?? [clean];
  return [
    "The founder provided a long brief. Treat these segments as one continuous request; do not ask the founder to split it manually.",
    ...chunks.map((chunk, index) => `Segment ${index + 1}/${chunks.length}:\n${chunk}`),
  ].join("\n\n");
}

export function formatConversationContext(
  messages: { role: "user" | "assistant"; text: string }[],
): string {
  if (!messages.length) return "";
  return messages
    .slice(-8)
    .map((message) => `${message.role === "user" ? "Founder" : "Harmony"}: ${message.text}`)
    .join("\n\n");
}

export function executiveCompletionReport(params: {
  locale?: string | null;
  completedWork: string;
  businessImpact: string;
  technicalImpact?: string;
  risk?: string;
  nextStep: string;
  launchReadiness?: string;
}): string {
  const language = languageFromLocale(params.locale);
  if (language === "es") {
    return [
      "Resumen ejecutivo",
      "",
      `Trabajo completado: ${params.completedWork}`,
      `Impacto de negocio: ${params.businessImpact}`,
      `Impacto técnico: ${params.technicalImpact ?? "Sin cambios técnicos de alto riesgo."}`,
      `Riesgo: ${params.risk ?? "Bajo. Mantengo las acciones sensibles sujetas a aprobación."}`,
      `Siguiente paso recomendado: ${params.nextStep}`,
      `Preparación de lanzamiento: ${params.launchReadiness ?? "Avanza, con verificación pendiente en producción."}`,
    ].join("\n");
  }

  return [
    "Executive Summary",
    "",
    `Completed work: ${params.completedWork}`,
    `Business impact: ${params.businessImpact}`,
    `Technical impact: ${params.technicalImpact ?? "No high-risk technical change."}`,
    `Risk: ${params.risk ?? "Low. Sensitive actions remain approval-gated."}`,
    `Recommended next step: ${params.nextStep}`,
    `Launch readiness: ${params.launchReadiness ?? "Improved, pending live production verification."}`,
  ].join("\n");
}
