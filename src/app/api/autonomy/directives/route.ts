import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { createFounderDirective, revokeDirective } from "@/lib/harmony/autonomy/data-access";
import type { ActionType, AutonomyAgent, AutonomyDomain } from "@/lib/harmony/autonomy/types";

export const runtime = "nodejs";

/**
 * Founder directive grant/revoke API (Unified Autonomy Policy Engine).
 *
 * POST   → grant a directive (agent + domain + allowed/denied actions).
 * DELETE → revoke a directive by id.
 *
 * Owner-scoped: directives are written for the authenticated Founder and are
 * RLS-protected in `founder_directives`. Behaviour flows through the engine's
 * data-access layer — no new autonomy logic here.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    agent?: string;
    domain?: string;
    allowed_actions?: string[];
    denied_actions?: string[];
    expires_at?: string | null;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const agent = String(body.agent ?? "").trim() as AutonomyAgent;
  const domain = String(body.domain ?? "").trim() as AutonomyDomain;
  const allowedActions = Array.isArray(body.allowed_actions)
    ? (body.allowed_actions.map((a) => String(a).trim()).filter(Boolean) as ActionType[])
    : [];
  const deniedActions = Array.isArray(body.denied_actions)
    ? (body.denied_actions.map((a) => String(a).trim()).filter(Boolean) as ActionType[])
    : [];

  if (!agent || !domain || (allowedActions.length === 0 && deniedActions.length === 0)) {
    return NextResponse.json({ error: "invalid_directive" }, { status: 400 });
  }

  const companyId = await resolvePrimaryCompanyId();
  const directive = await createFounderDirective(user.id, companyId, {
    agent,
    domain,
    allowed_actions: allowedActions,
    denied_actions: deniedActions,
    status: "active",
    granted_at: new Date().toISOString(),
    expires_at: body.expires_at ?? undefined,
  });

  if (!directive) {
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, directive }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { directive_id?: string } | null;
  const directiveId = String(body?.directive_id ?? "").trim();
  if (!directiveId) {
    return NextResponse.json({ error: "missing_directive_id" }, { status: 400 });
  }

  const ok = await revokeDirective(user.id, directiveId);
  if (!ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
