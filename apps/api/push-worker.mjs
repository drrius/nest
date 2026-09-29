import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { ApnsEnvironment } from "../../packages/contracts/src/push-registration.ts";
import { nodeServer } from "./node-server.mjs";
import { pushWorkerRpc } from "./src/push/worker-rpc.ts";
import { apnsPushTransport } from "./src/push/apns-transport.ts";
import { apnsDeliveryWorker } from "./src/push/apns-delivery-worker.ts";
import { runPushCycle } from "./src/push/cycle.ts";
import { createPushSchedulerHandler } from "./src/push/scheduler-handler.ts";
if (process.env.NEST_PUSH_WORKER_ENABLED !== "true") throw new Error("Push worker is disabled");
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
};
const rpc = pushWorkerRpc(
  { url: required("NEST_SUPABASE_URL"), publishableKey: required("NEST_SUPABASE_PUBLISHABLE_KEY") },
  Redacted.make(required("NEST_SUPABASE_PUSH_SECRET")),
);
const environment = Schema.decodeUnknownSync(ApnsEnvironment)(required("NEST_APNS_ENVIRONMENT"));
const provider = apnsPushTransport(
  {
    keyId: required("NEST_APNS_KEY_ID"),
    teamId: required("NEST_APNS_TEAM_ID"),
    privateKey: Redacted.make(required("NEST_APNS_PRIVATE_KEY")),
  },
  environment,
);
const worker = apnsDeliveryWorker(rpc, provider, environment);
const handler = createPushSchedulerHandler(
  Redacted.make(required("NEST_PUSH_SCHEDULER_TOKEN")),
  () => runPushCycle(rpc, worker),
);
const port = Number(process.env.NEST_PUSH_PORT ?? "8789");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid push worker port");
const server = nodeServer(handler);
server.on("close", () => provider.close());
server.listen(port, "127.0.0.1");
