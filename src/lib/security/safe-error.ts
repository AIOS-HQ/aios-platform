import "server-only";

const SECRET_PATTERNS = [
  /gho_[A-Za-z0-9_]+/g,
  /ghp_[A-Za-z0-9_]+/g,
  /sk-[A-Za-z0-9_-]+/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /(access_token|refresh_token|client_secret|token|secret|api[_-]?key)=([^&\s]+)/gi,
];

export function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function safeErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "unknown error";
  return SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, "[redacted]"),
    message,
  );
}

export function logSafeError(scope: string, error: unknown): void {
  if (process.env.NODE_ENV === "production") {
    console.error(scope, safeErrorMessage(error));
    return;
  }
  console.error(scope, error);
}
