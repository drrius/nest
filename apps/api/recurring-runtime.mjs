import * as Redacted from "effect/Redacted";
import { createRecurringScheduler } from "./src/money/recurring-scheduler-handler.ts";

function unavailable(status, error) {
  return () =>
    Response.json(
      { error },
      { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
    );
}

function required(environment, name) {
  const value = environment[name];
  if (!value) throw new Error("Incomplete server-only recurring configuration");
  return value;
}

/** Deployment is inert until a separate, server-only worker opt-in is configured. */
export function recurringRuntimeHandler(environment) {
  if (environment.NEST_RECURRING_WORKER_ENABLED !== "true") return unavailable(404, "not_found");
  try {
    return createRecurringScheduler(
      {
        url: required(environment, "NEST_SUPABASE_URL"),
        publishableKey: required(environment, "NEST_SUPABASE_PUBLISHABLE_KEY"),
      },
      Redacted.make(required(environment, "NEST_SUPABASE_RECURRING_SECRET")),
      Redacted.make(required(environment, "NEST_RECURRING_SCHEDULER_TOKEN")),
    );
  } catch {
    return unavailable(503, "unavailable");
  }
}
