import "server-only";

import { headers } from "next/headers";

export type OriginMatch = boolean | "unknown";

export interface AuthOriginEnvironment {
  NEXT_PUBLIC_SITE_URL?: string;
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
  VERCEL_BRANCH_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
}

function runtimeAuthOriginEnvironment(): AuthOriginEnvironment {
  return {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  };
}

function parseAbsoluteOrigin(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function parseApprovedVercelOrigin(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  try {
    const url = new URL(normalized.includes("://") ? normalized : `https://${normalized}`);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.port
      || url.pathname !== "/"
      || url.search
      || url.hash
      || !/^aios-platform-[a-z0-9-]+-air-bid\.vercel\.app$/i.test(url.hostname)
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function previewOrigins(environment: AuthOriginEnvironment): Set<string> {
  const origins = new Set<string>();
  for (const value of [environment.VERCEL_BRANCH_URL, environment.VERCEL_URL]) {
    const origin = parseApprovedVercelOrigin(value);
    if (origin) origins.add(origin);
  }
  return origins;
}

function productionOrigin(environment: AuthOriginEnvironment): string | null {
  return parseAbsoluteOrigin(environment.NEXT_PUBLIC_SITE_URL)
    ?? parseApprovedVercelOrigin(environment.VERCEL_PROJECT_PRODUCTION_URL);
}

/**
 * Resolves a request origin only when it is an exact environment-backed AIOS
 * origin. Forwarded hosts never become trusted merely because they end in a
 * familiar domain.
 */
export function trustedAuthOrigin(
  requestOrigin: string,
  environment: AuthOriginEnvironment = runtimeAuthOriginEnvironment(),
): string | null {
  const parsedRequestOrigin = parseAbsoluteOrigin(requestOrigin);
  if (!parsedRequestOrigin) return null;
  if (environment.VERCEL_ENV === "preview") {
    return previewOrigins(environment).has(parsedRequestOrigin)
      ? parsedRequestOrigin
      : null;
  }
  const canonicalOrigin = productionOrigin(environment);
  return parsedRequestOrigin === canonicalOrigin ? parsedRequestOrigin : null;
}

export function requestOriginMatchesTrustedAuthOrigin(
  request: Request,
  environment: AuthOriginEnvironment = runtimeAuthOriginEnvironment(),
): OriginMatch {
  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return "unknown";
  }
  const configuredOrigins = environment.VERCEL_ENV === "preview"
    ? previewOrigins(environment)
    : new Set([productionOrigin(environment)].filter((value): value is string => Boolean(value)));
  if (configuredOrigins.size === 0) return "unknown";
  return trustedAuthOrigin(requestOrigin, environment) === requestOrigin;
}

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",", 1)[0]?.trim();
  return first || null;
}

/** Server-action callback origin: exact Preview system host or Production canonical origin. */
export async function resolveAuthSiteOrigin(
  environment: AuthOriginEnvironment = runtimeAuthOriginEnvironment(),
): Promise<string> {
  if (environment.VERCEL_ENV !== "preview") {
    return productionOrigin(environment) ?? "http://localhost:3000";
  }
  const requestHeaders = await headers();
  const host = firstHeaderValue(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
  );
  const protocol = firstHeaderValue(requestHeaders.get("x-forwarded-proto")) ?? "https";
  const requestOrigin = host ? `${protocol}://${host}` : "";
  return trustedAuthOrigin(requestOrigin, environment)
    ?? "http://localhost:3000";
}
