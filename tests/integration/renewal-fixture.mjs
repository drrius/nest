import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fixture as recurring, id, run } from "./recurring-worker-fixture.mjs";
import { renewalClient } from "../../apps/mobile/src/renewals/client.ts";
export { id, run };
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
export const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
export async function fixture(t, extraFiles = []) {
  const f = await recurring(t, [
    "supabase/migrations/20260922202827_native_renewal_storage.sql",
    ...extraFiles,
  ]);
  const source = readFileSync(
    "supabase/migrations/20260921120810_native_ai_expense_proposal.sql",
    "utf8",
  );
  f.db.sql(source.slice(0, source.indexOf("create function private.nest_canonical_expense")));
  const client = (actor = 1, bearer = f.bearer) =>
    renewalClient(
      f.url,
      { actor: id(actor), household: id(10) },
      Effect.succeed({ user: { id: id(actor) }, access_token: bearer }),
    );
  const command = {
    operationId: id(901),
    renewalId: id(900),
    expectedRevision: null,
    fields: {
      title: "Internet",
      renewalOn: "2028-03-01",
      noticeDays: 1,
      responsibleId: id(2),
      recurringRuleId: null,
    },
  };
  return { ...f, client, command, native: client() };
}
