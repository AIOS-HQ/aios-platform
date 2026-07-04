/**
 * Universal Capability Runtime (Group B) — public surface.
 *
 * One runtime every connector inherits. Specialization is data (the registry +
 * registered handlers), never forked code. Server-only transitively (runtime +
 * health touch tokens/connections); import specific submodules from client code
 * if ever needed.
 */
export * from "./types";
export * from "./retry";
export * from "./capabilities";
export * from "./health";
export * from "./telemetry";
export * from "./runtime";
