import * as Redacted from "effect/Redacted";
import { gatewayModel } from "@nest/ai/chat";
import { createHandler } from "./src/handler.ts";
import { nodeServer } from "./node-server.mjs";

const url = process.env.NEST_SUPABASE_URL;
const publishableKey = process.env.NEST_SUPABASE_PUBLISHABLE_KEY;
if (!url || !publishableKey)
  throw new Error("Configure an isolated backend in apps/api/.env; see README.md");
const port = Number(process.env.NEST_API_PORT ?? "8787");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid NEST_API_PORT");
const model =
  process.env.AI_GATEWAY_API_KEY && process.env.NEST_AI_MODEL
    ? gatewayModel(process.env.AI_GATEWAY_API_KEY, process.env.NEST_AI_MODEL)
    : undefined;
const planningSecret = process.env.NEST_SUPABASE_PLANNING_SECRET
  ? Redacted.make(process.env.NEST_SUPABASE_PLANNING_SECRET)
  : undefined;
const server = nodeServer(createHandler({ url, publishableKey }, { model, planningSecret }));
server.listen(port, "127.0.0.1", () =>
  process.stdout.write(`Nest development API: http://127.0.0.1:${port}\n`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    server.close();
    server.closeAllConnections();
  });
