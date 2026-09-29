import * as Redacted from "../../apps/api/node_modules/effect/dist/Redacted.js";
import { fixture } from "../database/summary-push-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { pushWorkerRpc } from "../../apps/api/src/push/worker-rpc.ts";
import { summaryPushRpc } from "../../apps/api/src/push/summary-rpc.ts";
import { loadPushCycleSchema } from "./push-cycle-schema.mjs";
export async function summaryWorkerFixture(t, databaseFixture = fixture) {
  const f = databaseFixture(t);
  f.db.file("supabase/migrations/20260923005427_native_push_worker_rpc.sql");
  loadPushCycleSchema(f.db);
  const http = await postgrestFixture(t, [], f.db);
  const baseRpc = pushWorkerRpc(
    { url: http.url, publishableKey: "sb_publishable_fixture" },
    Redacted.make(http.serverKey),
  );
  return { ...f, baseRpc, rpc: summaryPushRpc(baseRpc) };
}
