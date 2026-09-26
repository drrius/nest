import * as Redacted from "effect/Redacted";
import { gatewayModel } from "@nest/ai/chat";
import { createHandler } from "./src/handler.ts";

export function runtimeHandler(environment) {
  const url = environment.NEST_SUPABASE_URL;
  const publishableKey = environment.NEST_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey)
    throw new Error("Configure an isolated backend in apps/api/.env; see README.md");
  const model =
    environment.AI_GATEWAY_API_KEY && environment.NEST_AI_MODEL
      ? gatewayModel(environment.AI_GATEWAY_API_KEY, environment.NEST_AI_MODEL)
      : undefined;
  const planningSecret = environment.NEST_SUPABASE_PLANNING_SECRET
    ? Redacted.make(environment.NEST_SUPABASE_PLANNING_SECRET)
    : undefined;
  return createHandler({ url, publishableKey }, { model, planningSecret });
}
