import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { ApnsEnvironment } from "../../packages/contracts/src/push-registration.ts";
import { apnsPushTransport } from "./src/push/apns-transport.ts";
import { apnsDeliveryWorker } from "./src/push/apns-delivery-worker.ts";
import { runPushCycle } from "./src/push/cycle.ts";
import { createPushSchedulerHandler } from "./src/push/scheduler-handler.ts";
import { pushWorkerRpc } from "./src/push/worker-rpc.ts";
import { observeHandler } from "./src/telemetry.ts";

function unavailable(status, error) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

function required(environment, name) {
  if (!environment[name]) throw new Error("Incomplete push configuration");
  return environment[name];
}

export function pushRuntimeHandler(environment) {
  return observeHandler(async (request) => {
    if (environment.NEST_PUSH_WORKER_ENABLED !== "true") return unavailable(404, "not_found");
    let provider;
    try {
      const rpc = pushWorkerRpc(
        {
          url: required(environment, "NEST_SUPABASE_URL"),
          publishableKey: required(environment, "NEST_SUPABASE_PUBLISHABLE_KEY"),
        },
        Redacted.make(required(environment, "NEST_SUPABASE_PUSH_SECRET")),
      );
      const apnsEnvironment = Schema.decodeUnknownSync(ApnsEnvironment)(
        required(environment, "NEST_APNS_ENVIRONMENT"),
      );
      provider = apnsPushTransport(
        {
          keyId: required(environment, "NEST_APNS_KEY_ID"),
          teamId: required(environment, "NEST_APNS_TEAM_ID"),
          privateKey: Redacted.make(required(environment, "NEST_APNS_PRIVATE_KEY")),
        },
        apnsEnvironment,
      );
      const worker = apnsDeliveryWorker(rpc, provider, apnsEnvironment);
      const handler = createPushSchedulerHandler(
        Redacted.make(required(environment, "NEST_PUSH_SCHEDULER_TOKEN")),
        () => runPushCycle(rpc, worker),
      );
      return await handler(request);
    } catch {
      return unavailable(503, "unavailable");
    } finally {
      provider?.close();
    }
  }, environment);
}
