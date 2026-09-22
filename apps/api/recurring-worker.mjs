import * as Redacted from "effect/Redacted";
import { nodeServer } from "./node-server.mjs";
import { createRecurringScheduler } from "./src/money/recurring-scheduler-handler.ts";
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
};
const handler = createRecurringScheduler(
  { url: required("NEST_SUPABASE_URL"), publishableKey: required("NEST_SUPABASE_PUBLISHABLE_KEY") },
  Redacted.make(required("NEST_SUPABASE_RECURRING_SECRET")),
  Redacted.make(required("NEST_RECURRING_SCHEDULER_TOKEN")),
);
const port = Number(process.env.NEST_RECURRING_PORT ?? "8788");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid worker port");
nodeServer(handler).listen(port, "127.0.0.1");
