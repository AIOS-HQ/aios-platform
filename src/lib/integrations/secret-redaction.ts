const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /(access[_-]?token["'\s:=]+)["']?[^"',\s}]+/gi,
  /(refresh[_-]?token["'\s:=]+)["']?[^"',\s}]+/gi,
  /(client[_-]?secret["'\s:=]+)["']?[^"',\s}]+/gi,
  /(api[_-]?key["'\s:=]+)["']?[^"',\s}]+/gi,
  /(signing[_-]?secret["'\s:=]+)["']?[^"',\s}]+/gi,
];

export function redactSecret(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value ?? "");
  return SECRET_PATTERNS.reduce((acc, pattern) => {
    if (pattern.source.startsWith("Bearer")) return acc.replace(pattern, "Bearer [REDACTED]");
    return acc.replace(pattern, "$1[REDACTED]");
  }, text);
}

export function redactDiagnostics<T>(value: T): T {
  if (typeof value === "string") return redactSecret(value) as T;
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactDiagnostics(item)) as T;

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(token|secret|password|authorization|apiKey|api_key)/i.test(key)) {
      out[key] = "[REDACTED]";
    } else {
      out[key] = redactDiagnostics(item);
    }
  }
  return out as T;
}
