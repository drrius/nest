import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { expenseApiFixture } from "./expense-api-fixture.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { moneyCategoryTool } from "../../apps/api/src/money/category-tool.ts";
import { id } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const run = (effect) => Effect.runPromise(effect.pipe(Effect.provideService(Fetch.Fetch, fetch)));
test("native and SDK category reads share exact names, archive state and tenant isolation with minimal grants", async (t) => {
  const f = await expenseApiFixture(t);
  f.db.sql(`revoke select on public.expense_categories from authenticated;
    insert into public.expense_categories(id,household_id,name,sort_order) values ('${id(100)}','${id(10)}','Home',0),('${id(101)}','${id(20)}','Private category',0);`);
  f.db.file("supabase/migrations/20260921123952_native_expense_category_read.sql");
  const client = moneyClient(
    f.url,
    { actor: id(1), household: id(10) },
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  assert.deepEqual(await run(client.category(id(100))), {
    categoryId: id(100),
    name: "Home",
    archived: false,
  });
  assert.equal(await run(client.category(id(101))), null);
  assert.throws(
    () =>
      f.db.sql(
        `set role authenticated; set request.jwt.claims='{"sub":"${id(1)}"}'; select sort_order from public.expense_categories`,
      ),
    /permission denied/,
  );
  const headers = { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) };
  const tool = moneyCategoryTool(new Request(f.url, { headers }), {
    url: f.supabaseUrl,
    publishableKey: "sb_publishable_fixture",
  });
  const result = await tool.execute(
    { categoryId: id(100) },
    { toolCallId: "category", messages: [] },
  );
  assert.equal(result.ok, true);
  assert.equal(result.value.category.name, "Home");
  f.db.sql(
    `update public.expense_categories set archived_at=now(),name='Household' where id='${id(100)}'`,
  );
  assert.deepEqual(await run(client.category(id(100))), {
    categoryId: id(100),
    name: "Household",
    archived: true,
  });
  assert.equal(
    (
      await fetch(`${f.url}/v1/money/category?categoryId=${id(100)}&categoryId=${id(100)}`, {
        headers,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(`${f.url}/v1/money/category?categoryId=${id(100)}`, {
        headers: { ...headers, authorization: `Bearer ${f.otherBearer}` },
      })
    ).status,
    403,
  );
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await assert.rejects(run(client.category(id(100))), { code: "forbidden" });
});
