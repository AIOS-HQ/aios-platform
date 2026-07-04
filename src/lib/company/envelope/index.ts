/**
 * Company Context Envelope (Phase 2.1 · Foundation 1) — public surface.
 *
 * The identity layer every AI worker derives behavior from. Server-only
 * (data-access uses the RLS server client). Additive + inert until workers/UI
 * read it; adoption is incremental, starting with Harmony.
 */
export * from "./types";
export * from "./data-access";
export * from "./context";
