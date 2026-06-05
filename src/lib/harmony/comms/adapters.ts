import "server-only";

import type { ChannelKind } from "./catalog";

/**
 * Channel adapter abstraction. Every channel resolves to an adapter that knows
 * how to deliver an outbound message. Until real credentials are wired, all
 * channels use the MockAdapter, which simulates delivery (no network).
 *
 * To go live, add a real adapter (e.g. TelegramAdapter, WhatsAppAdapter) and
 * return it from `getAdapter` when the channel is connected + credentials exist.
 */
export type DeliveryResult = {
  status: "sent" | "failed";
  detail?: string;
};

export interface ChannelAdapter {
  readonly kind: ChannelKind | "mock";
  /** Whether this adapter can actually deliver (false = stub/not connected). */
  readonly live: boolean;
  send(to: string, body: string): Promise<DeliveryResult>;
}

class MockAdapter implements ChannelAdapter {
  readonly kind = "mock" as const;
  readonly live = false;
  async send(): Promise<DeliveryResult> {
    // Simulated delivery — no external call. Real adapters replace this.
    return { status: "sent", detail: "mock" };
  }
}

const mock = new MockAdapter();

/**
 * Resolve the adapter for a channel kind. Returns the mock adapter for now;
 * real adapters slot in here once their credentials are configured.
 */
export function getAdapter(_kind: ChannelKind): ChannelAdapter {
  return mock;
}
