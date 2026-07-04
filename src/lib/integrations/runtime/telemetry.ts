import type { TelemetryEvent, TelemetrySink } from "./types";

/**
 * Telemetry / usage-analytics / audit sink. Pluggable so the persistent store
 * (a capability_invocations table) can be wired in Group C without touching the
 * runtime. The default is a no-op: the core ships inert and safe; injecting a
 * real sink turns on analytics + audit.
 */

export const noopTelemetrySink: TelemetrySink = {
  record(): void {
    /* inert default — replaced via setTelemetrySink in Group C */
  },
};

let activeSink: TelemetrySink = noopTelemetrySink;

export function setTelemetrySink(sink: TelemetrySink): void {
  activeSink = sink;
}

export function getTelemetrySink(): TelemetrySink {
  return activeSink;
}
