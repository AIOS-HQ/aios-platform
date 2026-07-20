import { NextResponse } from "next/server";
import {
  verifyWhatsAppSignature,
  verifyWhatsAppWebhookToken,
} from "@/lib/integrations/providers/whatsapp/client";
import { processWhatsAppWebhook } from "@/lib/integrations/providers/whatsapp/webhook";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (!challenge || !verifyWhatsAppWebhookToken(mode, token)) {
    return NextResponse.json({ ok: false, error: "verification_failed" }, { status: 403 });
  }
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyWhatsAppSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const result = await processWhatsAppWebhook(payload);
  return NextResponse.json({ ok: result.blockers.length === 0, ...result });
}
