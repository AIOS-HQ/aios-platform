import {
  runOperator,
  isStreamableHarmonyTurn,
  beginHarmonyStream,
  finalizeHarmonyStream,
} from "@/lib/harmony/operator-actions";
import { getProvider } from "@/lib/ai/provider";

/**
 * Streaming Harmony — the canonical chat's SSE endpoint.
 *
 * ONE brain, two transports:
 * - Structured / rule-based / no-provider turns → `runOperator` returns a single
 *   JSON result (no streaming). Confirm-before-write (task/goal proposals),
 *   delegation, summaries, and suggestions are completely unchanged.
 * - Free-form generative turns → stream tokens as Server-Sent Events, then
 *   persist the reply and emit a final `result` event.
 *
 * The endpoint is resilient: if token streaming fails it falls back to a
 * one-shot non-streaming generation in-route, and ALWAYS emits a `result` then
 * `[DONE]`. The client additionally falls back to `runOperator` on any transport
 * error, so the canonical chat can never regress.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const sse = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

export async function POST(req: Request): Promise<Response> {
  let input = "";
  try {
    const body = await req.json();
    if (typeof body?.input === "string") input = body.input;
  } catch {
    // No / invalid body — treat as empty; runOperator will return its guidance.
  }

  // Non-streamable turns: delegate to the canonical brain, single JSON result.
  if (!(await isStreamableHarmonyTurn(input))) {
    try {
      const result = await runOperator(input);
      return Response.json({ kind: "result", result });
    } catch (err) {
      console.error("[harmony/stream] runOperator failed", err);
      return Response.json({ kind: "error" }, { status: 500 });
    }
  }

  const begun = await beginHarmonyStream(input);
  if (!begun) {
    // Couldn't set up streaming — let the canonical brain handle it.
    try {
      const result = await runOperator(input);
      return Response.json({ kind: "result", result });
    } catch (err) {
      console.error("[harmony/stream] fallback runOperator failed", err);
      return Response.json({ kind: "error" }, { status: 500 });
    }
  }

  const provider = getProvider();
  const { system, prompt } = begun;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let acc = "";
      try {
        if (provider.generateStream) {
          for await (const delta of provider.generateStream(prompt, system)) {
            if (!delta) continue;
            acc += delta;
            controller.enqueue(sse({ delta }));
          }
        } else {
          acc = await provider.generate(prompt, system);
          if (acc) controller.enqueue(sse({ delta: acc }));
        }
      } catch (err) {
        // Token streaming failed — try a one-shot non-streaming generation so
        // the user still gets Harmony's full reply.
        console.error("[harmony/stream] stream failed, falling back", err);
        try {
          acc = await provider.generate(prompt, system);
        } catch (err2) {
          console.error("[harmony/stream] non-stream fallback failed", err2);
        }
      }

      try {
        const result = await finalizeHarmonyStream(acc);
        controller.enqueue(sse({ result }));
      } catch (err) {
        console.error("[harmony/stream] finalize failed", err);
        controller.enqueue(
          sse({ result: { intent: "general", reply: acc } }),
        );
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
