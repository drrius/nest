import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture as server, id, run } from "./legacy-confirmation-fixture.mjs";
import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { legacyConfirmationApprovalOperations } from "../../apps/mobile/src/money/legacy-confirmation-approval-operations.ts";
import { LegacyConfirmationApprovalRuntime } from "../../apps/mobile/src/money/legacy-confirmation-approval-runtime.ts";
export { id, run };
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
export async function fixture(t, withCategory = false) {
  const f = await server(t, [
      "supabase/migrations/20260922030816_native_legacy_confirmation_approval.sql",
      "supabase/migrations/20260921123952_native_expense_category_read.sql",
    ]),
    local = await sqlite(t);
  if (withCategory) {
    f.db.sql(
      `insert into public.expense_categories(id,household_id,name,sort_order) values('${id(500)}','${id(10)}','Household',0)`,
    );
    f.command.input.expense.categoryId = id(500);
  }
  const native = moneyClient(
    f.url,
    { actor: id(1), household: id(10) },
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  const session = await run(local.store.activate({ actor: id(1), household: id(10) }, id(950)));
  const response = await fetch(`${f.supabaseUrl}/rest/v1/rpc/nest_propose_action`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({
      p_household: id(10),
      p_invocation: f.command.operationId,
      p_command: "recurring.confirm-legacy-draft",
      p_version: 1,
      p_payload: f.command.input,
    }),
  });
  assert.equal(response.ok, true, await response.clone().text());
  const approvalId = await response.json();
  let fault = "none",
    sends = 0;
  const transport = async (input, init) => {
    const decision = String(input).includes("/approval/decide");
    if (decision) {
      sends++;
      if (fault === "before") throw new TypeError("not sent");
    }
    const result = await fetch(input, init);
    if (decision && fault === "after") throw new TypeError("lost acknowledgment");
    return result;
  };
  const client = Object.fromEntries(
    [
      "legacyConfirmationApproval",
      "legacyConfirmationContext",
      "decideLegacyConfirmation",
      "category",
    ].map((key) => [
      key,
      (input) => native[key](input).pipe(Effect.provideService(Fetch.Fetch, transport)),
    ]),
  );
  const operations = (store = local.store) =>
    legacyConfirmationApprovalOperations({ store, session }, client);
  const mount = async (store = local.store) => {
    const runtime = new LegacyConfirmationApprovalRuntime(operations(store), approvalId);
    t.after(() => runtime.dispose());
    await runtime.setOnline(true);
    await runtime.setActive(true);
    return runtime;
  };
  return {
    ...f,
    local,
    session,
    client,
    approvalId,
    operations,
    mount,
    decision: { ...f.command, approvalId, approved: true },
    sends: () => sends,
    fault: (value) => {
      fault = value;
    },
  };
}
