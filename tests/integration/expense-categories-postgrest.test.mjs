import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { expenseApiFixture } from "./expense-api-fixture.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { moneyCategoriesTool } from "../../apps/api/src/money/category-tool.ts";
import { id } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect")),
  Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const run = (effect) => Effect.runPromise(effect.pipe(Effect.provideService(Fetch.Fetch, fetch)));
test("native and SDK enumerate active categories without gaps or tenant leaks through minimal grants", async (t) => {
  const f = await expenseApiFixture(t);
  f.db.sql(`revoke select on public.expense_categories from authenticated;
 insert into public.expense_categories(id,household_id,name,sort_order) values ${Array.from({ length: 102 }, (_, n) => `('${id(n + 100)}','${id(10)}','Category ${n}',${n})`).join(",")},('${id(999)}','${id(20)}','Foreign',0);
 update public.expense_categories set archived_at=now() where id='${id(150)}';`);
  f.db.file("supabase/migrations/20260921123952_native_expense_category_read.sql");
  const client = moneyClient(
    f.url,
    { actor: id(1), household: id(10) },
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  const pages = [];
  let after = null;
  do {
    const page = await run(client.categories(after));
    pages.push(page);
    after = page.next;
  } while (after);
  assert.deepEqual(
    pages.map((p) => p.categories.length),
    [50, 50, 1],
  );
  const ids = pages.flatMap((p) => p.categories.map((c) => c.categoryId));
  assert.equal(new Set(ids).size, 101);
  assert.equal(ids.includes(id(150)), false);
  assert.equal(ids.includes(id(999)), false);
  const headers = { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) };
  const tool = moneyCategoriesTool(new Request(f.url, { headers }), {
    url: f.supabaseUrl,
    publishableKey: "sb_publishable_fixture",
  });
  const result = await tool.execute(
    { after: pages[0].next },
    { toolCallId: "categories", messages: [] },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, pages[1]);
  for (const query of [`after=${id(100)}&after=${id(100)}`, `actorId=${id(2)}`, "after=bad"])
    assert.equal((await fetch(`${f.url}/v1/money/categories?${query}`, { headers })).status, 400);
  assert.equal(
    (
      await fetch(`${f.url}/v1/money/categories`, {
        headers: { ...headers, authorization: `Bearer ${f.otherBearer}` },
      })
    ).status,
    403,
  );
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await assert.rejects(run(client.categories()), { code: "forbidden" });
});
