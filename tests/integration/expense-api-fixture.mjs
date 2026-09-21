import { createHandler } from "../../apps/api/src/handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { id } from "../database/native-expense-helpers.mjs";
export async function expenseApiFixture(t) {
  const f = await postgrestFixture(t, [
    "tests/database/money-expense-fixture.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260919213407_native_action_approvals.sql",
    "supabase/migrations/20260921114330_native_expense_command.sql",
    "supabase/migrations/20260921120149_native_expense_approval.sql",
    "supabase/migrations/20260921103207_native_money_balance_read.sql",
  ]);
  const server = nodeServer(
    createHandler({ url: f.url, publishableKey: "sb_publishable_fixture" }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}`;
  const send = (path, input, token = f.bearer, base = url) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-nest-household": id(10),
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });
  const rpc = async (name, input) => {
    const response = await fetch(new URL(`rest/v1/rpc/${name}`, f.url), {
      method: "POST",
      headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw Error(await response.text());
    return response.json();
  };
  return { ...f, supabaseUrl: f.url, url, send, rpc };
}
