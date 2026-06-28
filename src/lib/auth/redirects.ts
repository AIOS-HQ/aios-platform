export function safeRedirectPath(value: unknown, fallback = "/harmony"): string {
  const next = typeof value === "string" ? value : "";
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}
