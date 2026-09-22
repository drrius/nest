import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture as server, id, run } from "./legacy-dismissal-fixture.mjs";
import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { legacyDismissalApprovalOperations } from "../../apps/mobile/src/money/legacy-dismissal-approval-operations.ts";
import { LegacyDismissalApprovalRuntime } from "../../apps/mobile/src/money/legacy-dismissal-approval-runtime.ts";
export { id, run };
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
export async function fixture(t) {
  const f = await server(t, [
      "supabase/migrations/20260922020528_native_legacy_dismissal_approval.sql",
      "supabase/migrations/20260922021746_native_legacy_dismissal_withdrawal.sql",
    ]),
    local = await sqlite(t);
  const session = await run(local.store.activate({ actor: id(1), household: id(10) }, id(950)));
  const response = await fetch(`${f.supabaseUrl}/rest/v1/rpc/nest_propose_action`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({
      p_household: id(10),
      p_invocation: f.command.operationId,
      p_command: "recurring.dismiss-legacy-draft",
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
    ["legacyDismissalApproval", "legacyDismissalContext", "decideLegacyDismissal"].map((key) => [
      key,
      (input) => f.native[key](input).pipe(Effect.provideService(Fetch.Fetch, transport)),
    ]),
  );
  const operations = (store = local.store) =>
    legacyDismissalApprovalOperations({ store, session }, client);
  const mount = async (store = local.store) => {
    const runtime = new LegacyDismissalApprovalRuntime(operations(store), approvalId);
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
