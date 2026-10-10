import * as Redacted from "effect/Redacted";
import { gatewayModel } from "@nest/ai/chat";
import { createHandler } from "./src/handler.ts";
import { observeHandler } from "./src/telemetry.ts";

export function runtimeModel(environment) {
  if (!environment.NEST_AI_MODEL) return undefined;
  if (!environment.AI_GATEWAY_API_KEY && environment.NEST_AI_AUTH !== "vercel-oidc")
    return undefined;
  if (environment.NEST_AI_REASONING_EFFORT && environment.NEST_AI_REASONING_EFFORT !== "high")
    throw new Error("Unsupported AI reasoning effort");
  return gatewayModel(
    environment.AI_GATEWAY_API_KEY || undefined,
    environment.NEST_AI_MODEL,
    environment.NEST_AI_REASONING_EFFORT,
  );
}

export function runtimeHandler(environment) {
  const url = environment.NEST_SUPABASE_URL;
  const publishableKey = environment.NEST_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey)
    throw new Error("Configure an isolated backend in apps/api/.env; see README.md");
  const model = runtimeModel(environment);
  const planningSecret = environment.NEST_SUPABASE_PLANNING_SECRET
    ? Redacted.make(environment.NEST_SUPABASE_PLANNING_SECRET)
    : undefined;
  return observeHandler(
    createHandler({ url, publishableKey }, { model, planningSecret }),
    environment,
  );
}
