import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, client, model, id, ready, jsonOk } from "./meal-proposal-edit-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";

test("native edit reservation and real SDK completion replace only the selected private suggestion", async (t) => {
  const f = await fixture(t),
    { envelope, input } = await ready(f),
    provider = model(),
    c = client(f, provider.instance);
  const reserved = await jsonOk(
    await client(f, undefined, { planningSecret: undefined })("/edit/reserve", input),
  );
  assert.equal(reserved.status, "pending");
  assert.equal(provider.calls.length, 0);
  const response = await c("/edit", input);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const applied = await jsonOk(response);
  assert.equal(applied.status, "applied");
  assert.equal(provider.calls.length, 2);
  assert.equal(provider.calls[0].data.slots.length, 1);
  assert.deepEqual(await jsonOk(await c("/edit", input)), applied);
  assert.equal(provider.calls.length, 2);
  const current = await jsonOk(await c(`?proposalId=${input.proposalId}`));
  assert.equal(current.proposal.revision, "3");
  assert.equal(current.proposal.entries[0].entryId, input.entryId);
  assert.equal(current.proposal.entries[0].source.kind, "saved");
  assert.deepEqual(current.proposal.entries.slice(1), envelope.proposal.entries.slice(1));
  for (const secret of ["stateHash", "worker", "selection", "Vegetarian", f.serverKey])
    assert.equal(JSON.stringify(applied).includes(secret), false);
  for (const table of ["meal_plan_entries", "grocery_items", "routines"])
    assert.equal(f.db.sql(`select count(*) from public.${table}`), "0");
  assert.equal(
    (
      await c("/approve", {
        operationId: id(881),
        proposalId: input.proposalId,
        expectedRevision: "2",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await c("/approve", {
        operationId: id(882),
        proposalId: input.proposalId,
        expectedRevision: "3",
      })
    ).status,
    200,
  );
  assert.deepEqual(await jsonOk(await c("/edit", input)), applied);
});

test("favorite selection beyond the bounded shortlist is read exactly and only checked for suitability", async (t) => {
  const f = await fixture(t),
    { input } = await ready(f);
  f.db
    .sql(`insert into public.meal_definitions(id,household_id,name,nest_servings,nest_instructions)
   select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id(10)}','Recipe '||n,2,'Cook.' from generate_series(400,454) n;
   insert into public.meal_grocery_templates(id,household_id,meal_definition_id,name,quantity,unit,sort_order)
   values('${id(5000)}','${id(10)}','${id(454)}','Carrots','200','g',0)`);
  const revision = f.db.sql(
    `select revision from public.nest_meal_library_revisions where household_id='${id(10)}'`,
  );
  const provider = model(),
    c = client(f, provider.instance);
  const selection = {
    ...input,
    action: "choose",
    definitionId: id(454),
    expectedLibraryRevision: revision,
  };
  const applied = await jsonOk(await c("/edit", selection));
  assert.equal(applied.status, "applied");
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0].data.meals[0].recipe.title, "Recipe 454");
  const current = await jsonOk(await c(`?proposalId=${input.proposalId}`));
  assert.equal(current.proposal.entries[0].source.recipe.definitionId, id(454));
  assert.equal(current.proposal.entries[0].estimatedCaloriesPerServing, null);
});

test("lost worker claim never redispatches; lost completion recovers immutable applied result", async (t) => {
  for (const stage of ["claim", "finish"]) {
    const f = await fixture(t),
      { input } = await ready(f),
      provider = model();
    const proxy = await lostResponseProxy(t, f.url, `/rest/v1/rpc/nest_${stage}_proposal_edit`),
      c = client({ ...f, url: proxy.url }, provider.instance);
    assert.equal((await c("/edit", input)).status, 503);
    assert.equal(proxy.dropped(), 1);
    const result = await jsonOk(await c("/edit", input));
    assert.equal(result.status, stage === "claim" ? "pending" : "applied");
    assert.equal(provider.calls.length, stage === "claim" ? 0 : 2);
    if (stage === "claim") {
      f.db.sql(
        "update private.nest_meal_proposal_edits set deadline_at=clock_timestamp()-interval '1 second'",
      );
      const recovered = await jsonOk(await c("/edit/recover", { operationId: input.operationId }));
      assert.equal(recovered.failure, "unavailable");
      assert.equal(provider.calls.length, 0);
    }
  }
});

test("concurrent edit requests share one model run and reject a different pending intent", async (t) => {
  const f = await fixture(t),
    { input } = await ready(f);
  let start, release;
  const entered = new Promise((r) => {
      start = r;
    }),
    gate = new Promise((r) => {
      release = r;
    });
  const provider = model(async (value, index) => {
      if (index === 1) {
        start();
        await gate;
      }
      return value;
    }),
    c = client(f, provider.instance);
  const pending = c("/edit", input);
  await entered;
  assert.equal((await jsonOk(await c("/edit", input))).status, "pending");
  assert.equal((await c("/edit", { ...input, operationId: id(881) })).status, 409);
  release();
  assert.equal((await jsonOk(await pending)).status, "applied");
  assert.equal(provider.calls.length, 2);
});

test("changed constraints during generation and unsafe suitability fail without replacing the preview", async (t) => {
  for (const cause of ["constraints", "unsafe", "failure"]) {
    const f = await fixture(t),
      { input, envelope } = await ready(f);
    const provider = model((value, index) => {
        if (cause === "failure") throw new Error("private provider details");
        if (cause === "constraints" && index === 1)
          f.db.sql(
            `update public.nest_food_profiles set restrictions=array['Changed'] where actor_id='${id(2)}'`,
          );
        if (cause === "unsafe" && value.checks) value.checks[0].result = "unsafe";
        return value;
      }),
      c = client(f, provider.instance);
    const result = await jsonOk(await c("/edit", input));
    assert.equal(result.status, "failed");
    assert.equal(
      result.failure,
      cause === "constraints"
        ? "constraints_changed"
        : cause === "unsafe"
          ? "no_suitable_meals"
          : "unavailable",
    );
    assert.deepEqual(await jsonOk(await c(`?proposalId=${input.proposalId}`)), envelope);
    assert.equal(JSON.stringify(result).includes("private provider"), false);
    const calls = provider.calls.length;
    await c("/edit", input);
    assert.equal(provider.calls.length, calls);
  }
});

test("owner membership, exact command and credential boundaries precede any model call", async (t) => {
  const f = await fixture(t),
    { input } = await ready(f),
    provider = model(),
    c = client(f, provider.instance);
  for (const patch of [
    { approved: true },
    { actorId: id(2) },
    { entryId: id(999) },
    { expectedRevision: "1" },
  ]) {
    const response = await c("/edit", { ...input, ...patch });
    assert.ok([400, 409].includes(response.status));
  }
  assert.equal((await c("/edit?approved=true", input)).status, 400);
  assert.equal(
    (await client(f, provider.instance, { bearer: f.partnerBearer })("/edit", input)).status,
    409,
  );
  assert.equal(
    (await client(f, provider.instance, { bearer: f.otherBearer })("/edit", input)).status,
    403,
  );
  assert.equal(
    (await client(f, undefined, { planningSecret: undefined })("/edit", input)).status,
    503,
  );
  assert.equal(provider.calls.length, 0);
  await jsonOk(await c("/edit", input));
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await c("/edit", input)).status, 403);
  assert.equal((await c("/edit/recover", { operationId: input.operationId })).status, 403);
  assert.equal(provider.calls.length, 2);
});

test("cancellation and late provider output preserve the preview and recover without a second dispatch", async (t) => {
  const f = await fixture(t),
    { input, envelope } = await ready(f);
  let start, release;
  const entered = new Promise((r) => {
      start = r;
    }),
    gate = new Promise((r) => {
      release = r;
    });
  const provider = model(async (value, index) => {
      if (index === 1) {
        start();
        await gate;
      }
      return value;
    }),
    c = client(f, provider.instance),
    controller = new AbortController();
  const pending = c("/edit", input, controller.signal);
  await entered;
  controller.abort();
  assert.equal((await pending).status, 503);
  release();
  assert.equal((await jsonOk(await c("/edit", input))).status, "pending");
  assert.equal(provider.calls.length, 1);
  f.db.sql(
    "update private.nest_meal_proposal_edits set deadline_at=clock_timestamp()-interval '1 second'",
  );
  assert.equal(
    (await jsonOk(await c("/edit/recover", { operationId: input.operationId }))).failure,
    "unavailable",
  );
  assert.deepEqual(await jsonOk(await c(`?proposalId=${input.proposalId}`)), envelope);
});

test("replayed edit reservation detects changed planning constraints before model spend", async (t) => {
  const f = await fixture(t),
    { input, envelope } = await ready(f),
    provider = model(),
    c = client(f, provider.instance);
  await jsonOk(await c("/edit/reserve", input));
  f.db.sql(`update public.nest_food_profiles set portions=2 where actor_id='${id(2)}'`);
  assert.equal((await jsonOk(await c("/edit", input))).failure, "constraints_changed");
  assert.equal(provider.calls.length, 0);
  assert.deepEqual(await jsonOk(await c(`?proposalId=${input.proposalId}`)), envelope);
});
