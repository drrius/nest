import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { fixture as variable, id, run } from "./recurring-variable-fixture.mjs";
export { id, run };
export async function fixture(t) {
  const f = await variable(t, [
    "supabase/migrations/20260921230643_native_recurring_variable_approval.sql",
  ]);
  const local = await sqlite(t),
    account = { actor: id(1), household: id(10) };
  const session = await run(local.store.activate(account, id(900)));
  const approvalId = await f.rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: id(700),
    p_command: "recurring.record-cycle",
    p_version: 1,
    p_payload: f.command.input,
  });
  return { f, local, account, session, approvalId };
}
