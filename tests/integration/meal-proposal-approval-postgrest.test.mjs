import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, client, model, command, id } from "./meal-proposal-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const approval = (p, operation = 801) => ({
  operationId: id(operation),
  proposalId: p,
  expectedRevision: "2",
});
const native = (f, bearer = f.bearer) =>
  client(f, undefined, { planningSecret: undefined, bearer });
async function generate(f, operation = 800, bearer = f.bearer) {
  const response = await client(f, model().instance, { bearer })("/generate", command(operation));
  assert.equal(response.status, 200, await response.clone().text());
  const { envelope } = await response.json();
  assert.equal(envelope.proposal.status, "ready");
  return envelope.proposal;
}

test("explicit approval uses no model/secret and publishes the exact preview to the shared week once", async (t) => {
  const f = await fixture(t),
    preview = await generate(f),
    c = native(f);
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "0");
  const response = await c("/approve", approval(preview.proposalId));
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.equal(result.receipt.approvedRevision, preview.revision);
  assert.equal(result.receipt.entries.length, preview.entries.length);
  assert.equal(result.receipt.weekRevision, "7");
  const recipes = JSON.parse(
    f.db.sql(
      "select jsonb_agg(recipe order by entry_id) from public.nest_planned_recipe_snapshots",
    ),
  );
  assert.equal(recipes.length, 7);
  assert.deepEqual(
    recipes.map((r) => r.title).sort(),
    preview.entries.map((e) => e.source.recipe.title).sort(),
  );
  assert.deepEqual(await (await c("/approve", approval(preview.proposalId))).json(), result);
  assert.equal(
    (await (await c("/recover", { proposalId: preview.proposalId })).json()).proposal.status,
    "approved",
  );
  for (const table of ["grocery_items", "routines"])
    assert.equal(f.db.sql(`select count(*) from public.${table}`), "0");
});

test("committed approval with lost response recovers the historical receipt after a later week edit", async (t) => {
  const f = await fixture(t),
    p = (await generate(f)).proposalId;
  const proxy = await lostResponseProxy(t, f.url, "/rest/v1/rpc/nest_approve_meal_proposal");
  const c = native({ ...f, url: proxy.url });
  assert.equal((await c("/approve", approval(p))).status, 503);
  assert.equal(proxy.dropped(), 1);
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "7");
  f.db.sql(
    `insert into public.meal_plan_entries(household_id,date,slot,title_snapshot) values('${id(10)}','2030-01-07','lunch','Later edit')`,
  );
  const retry = await c("/approve", approval(p));
  assert.equal(retry.status, 200, await retry.clone().text());
  assert.equal((await retry.json()).receipt.weekRevision, "7");
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "8");
  assert.equal((await c("/approve", approval(p, 802))).status, 409);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await c("/approve", approval(p))).status, 403);
});

test("approval denies partner/outsider access, malformed commands and changed constraints before posting", async (t) => {
  const f = await fixture(t),
    p = (await generate(f)).proposalId,
    c = native(f);
  assert.equal((await native(f, f.partnerBearer)("/approve", approval(p))).status, 409);
  assert.equal((await native(f, f.otherBearer)("/approve", approval(p))).status, 403);
  assert.equal((await c("/approve")).status, 405);
  for (const patch of [
    { approved: true },
    { actorId: id(2) },
    { expectedRevision: 2 },
    { entries: [] },
  ])
    assert.equal((await c("/approve", { ...approval(p), ...patch })).status, 400);
  assert.equal((await c("/approve?approved=true", approval(p))).status, 400);
  f.db.sql(
    `update public.nest_food_profiles set restrictions=array['Changed'] where actor_id='${id(2)}'`,
  );
  assert.equal((await c("/approve", approval(p))).status, 409);
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "0");
});

test("two private proposals for one baseline cannot both post through the HTTP boundary", async (t) => {
  const f = await fixture(t),
    first = await generate(f),
    second = await generate(f, 802, f.partnerBearer);
  const responses = await Promise.all([
    native(f)("/approve", approval(first.proposalId)),
    native(f, f.partnerBearer)("/approve", approval(second.proposalId, 803)),
  ]);
  assert.deepEqual(
    responses.map((r) => r.status).sort((a, b) => a - b),
    [200, 409],
  );
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "7");
});
