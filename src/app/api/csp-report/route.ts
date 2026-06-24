import { NextResponse } from "next/server";

/**
 * CSP violation collector — the "collector" step of the
 * collector → nonces → enforce rollout. The CSP's `report-uri` / `report-to`
 * (see `src/lib/security/csp.ts`) point here.
 *
 * Unauthenticated by design: browsers POST violation beacons with no session.
 * We only LOG (structured, to the server console) — no new storage and no
 * unauthenticated DB-write surface. Always returns 204 and never throws, so a
 * malformed beacon can't error. Reports arrive in two shapes:
 *   - report-uri:  { "csp-report": { "violated-directive", "blocked-uri", … } }
 *   - report-to:   [ { "type": "csp-violation", "body": { effectiveDirective, blockedURL, … } } ]
 */
export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as unknown;
    const reports = Array.isArray(payload) ? payload : [payload];
    for (const raw of reports) {
      const r = raw as Record<string, unknown>;
      const inner =
        (r["csp-report"] as Record<string, unknown> | undefined) ??
        (r["body"] as Record<string, unknown> | undefined) ??
        r;
      const directive =
        inner?.["violated-directive"] ??
        inner?.["effectiveDirective"] ??
        "unknown";
      const blocked =
        inner?.["blocked-uri"] ?? inner?.["blockedURL"] ?? "unknown";
      const doc =
        inner?.["document-uri"] ?? inner?.["documentURL"] ?? "unknown";
      console.warn(
        `[csp] violation directive=${String(directive)} blocked=${String(
          blocked,
        )} doc=${String(doc)}`,
      );
    }
  } catch {
    // Ignore malformed/empty beacons — reporting must never error.
  }
  return new NextResponse(null, { status: 204 });
}
