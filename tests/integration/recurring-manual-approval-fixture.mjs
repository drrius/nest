import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { fixture as manual, id, run } from "./recurring-manual-fixture.mjs";
export { id, run };
export async function fixture(t) {
  const f = await manual(t, [
    "supabase/migrations/20260921235439_native_recurring_manual_approval.sql",
    "supabase/migrations/20260921235905_native_manual_cycle_context.sql",
  ]);
  const local = await sqlite(t),
    account = { actor: id(1), household: id(10) };
  const session = await run(local.store.activate(account, id(900)));
  const approvalId = await f.rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: id(700),
    p_command: "recurring.link-cycle",
    p_version: 1,
    p_payload: f.command.input,
  });
  return { f, local, account, session, approvalId };
}
