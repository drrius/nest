import type { Telemetry, TelemetryOptions } from "ai";

export type GenerationTelemetry = Telemetry;

export function privateTelemetry(integration?: GenerationTelemetry): TelemetryOptions {
  return {
    recordInputs: false,
    recordOutputs: false,
    integrations: integration ? [integration] : [],
  };
}
