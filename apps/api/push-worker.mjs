import * as Redacted from "effect/Redacted";
import { nodeServer } from "./node-server.mjs";
import { pushWorkerRpc } from "./src/push/worker-rpc.ts";
import { expoPushTransport } from "./src/push/expo-transport.ts";
import { pushDeliveryWorker } from "./src/push/delivery-worker.ts";
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
const expoSecret = process.env.NEST_EXPO_PUSH_ACCESS_TOKEN;
const worker = pushDeliveryWorker(
  rpc,
  expoPushTransport(expoSecret ? Redacted.make(expoSecret) : undefined),
);
const handler = createPushSchedulerHandler(
  Redacted.make(required("NEST_PUSH_SCHEDULER_TOKEN")),
  () => runPushCycle(rpc, worker),
);
const port = Number(process.env.NEST_PUSH_PORT ?? "8789");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid push worker port");
nodeServer(handler).listen(port, "127.0.0.1");
