import { createRequire } from "node:module";
import { fixture as variable, id, run } from "./recurring-variable-fixture.mjs";
import { recurringWorkerRpc } from "../../apps/api/src/money/recurring-worker-rpc.ts";
import { recurringWorkerClient } from "../../apps/api/src/money/recurring-worker-client.ts";
export { id, run };
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
export const Effect = require("effect/Effect"),
  Redacted = require("effect/Redacted");
export async function fixture(t) {
  const f = await variable(t, [
    "supabase/migrations/20260922001213_native_recurring_worker_boundary.sql",
  ]);
  f.db.sql("grant usage on schema public,private to service_role");
  const add = async (n) => {
    const rule = {
      ...f.rule,
      ruleId: id(n),
      configuration: {
        ...f.rule.configuration,
        mode: "fixed",
        amountCentimes: "101",
        allocations: [
          { memberId: id(1), centimes: "51" },
          { memberId: id(2), centimes: "50" },
        ],
      },
    };
    const saved = await run(f.client().saveRecurring({ operationId: id(n + 1000), rule }));
    return {
      householdId: id(10),
      ruleId: rule.ruleId,
      revision: saved.revision,
      dueOn: rule.firstDueOn,
    };
  };
  const rpc = recurringWorkerRpc(
    { url: f.supabaseUrl, publishableKey: "sb_publishable_fixture" },
    Redacted.make(f.serverKey),
  );
  return { ...f, add, rpc, worker: recurringWorkerClient(rpc) };
}
