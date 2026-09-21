import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, client, model, command, id } from "./meal-proposal-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";

test("authenticated SDK generation persists a private preview and retry/discard never writes active meals", async (t) => {
  const f = await fixture(t),
    provider = model(),
    c = client(f, provider.instance);
  const response = await c("/generate", command());
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get("cache-control"), "no-store");
  const ready = await response.json(),
    p = ready.receipt.proposalId;
  assert.equal(ready.envelope.proposal.status, "ready");
  assert.equal(ready.envelope.proposal.entries.length, 7);
  assert.equal(provider.calls.length, 2);
  assert.deepEqual(await (await c("/generate", command())).json(), ready);
  assert.equal(provider.calls.length, 2);
  for (const secret of ["stateHash", "1800", "2400", "Vegetarian", f.serverKey])
    assert.equal(JSON.stringify(ready).includes(secret), false);
  const reader = client(f, undefined, { planningSecret: undefined });
  assert.equal((await reader(`?proposalId=${p}`)).status, 200);
  assert.equal((await reader("/recover", { proposalId: p })).status, 200);
  const discard = await reader("/discard", {
    operationId: id(801),
    proposalId: p,
    expectedRevision: "2",
  });
  assert.equal(discard.status, 200);
  assert.equal(
    (await (await c("/generate", command())).json()).envelope.proposal.status,
    "discarded",
  );
  assert.equal(provider.calls.length, 2);
  for (const table of ["meal_plan_entries", "grocery_items", "routines"])
    assert.equal(f.db.sql(`select count(*) from public.${table}`), "0");
  assert.equal(
    (await client(f, provider.instance, { bearer: f.partnerBearer })(`?proposalId=${p}`)).status,
    409,
  );
  assert.equal(
    (await client(f, provider.instance, { bearer: f.otherBearer })(`?proposalId=${p}`)).status,
    403,
  );
});

test("concurrent generation requests share a single two-stage model run", async (t) => {
  const f = await fixture(t);
  let release, started;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const provider = model(async (value, index) => {
    if (index === 1) {
      started();
      await gate;
    }
    return value;
  });
  const c = client(f, provider.instance),
    first = c("/generate", command());
  await entered;
  const second = await c("/generate", command());
  assert.equal(second.status, 200);
  assert.equal((await second.json()).envelope.proposal.status, "generating");
  assert.equal(provider.calls.length, 1);
  release();
  assert.equal((await first).status, 200);
  assert.equal(provider.calls.length, 2);
});

test("lost completion acknowledgement recovers ready content without rerunning the provider", async (t) => {
  const f = await fixture(t),
    provider = model();
  const proxy = await lostResponseProxy(t, f.url, "/rest/v1/rpc/nest_finish_meal_proposal");
  const c = client({ ...f, url: proxy.url }, provider.instance);
  assert.equal((await c("/generate", command())).status, 503);
  assert.equal(proxy.dropped(), 1);
  const retry = await c("/generate", command());
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).envelope.proposal.status, "ready");
  assert.equal(provider.calls.length, 2);
});

test("changed constraints during model execution fail closed and never expose provider errors", async (t) => {
  const f = await fixture(t);
  const provider = model((value, index) => {
    if (index === 1)
      f.db.sql(
        `update public.nest_food_profiles set restrictions=array['Changed'] where actor_id='${id(2)}'`,
      );
    return value;
  });
  const c = client(f, provider.instance);
  const result = await (await c("/generate", command())).json();
  assert.equal(result.envelope.proposal.failure, "constraints_changed");
  assert.equal(result.envelope.proposal.entries, null);
  const failure = model(() => {
    throw new Error(`${f.serverKey}: private provider detail`);
  });
  const response = await client(f, failure.instance)("/generate", command(801));
  const body = await response.json();
  assert.equal(body.envelope.proposal.failure, "unavailable");
  assert.equal(JSON.stringify(body).includes("private provider"), false);
  assert.equal(JSON.stringify(body).includes(f.serverKey), false);
});

test("configuration, auth, strict input and revoked recovery fail before another generation", async (t) => {
  const f = await fixture(t),
    provider = model(),
    c = client(f, provider.instance);
  assert.equal((await client(f, undefined)("/generate", command())).status, 503);
  assert.equal(
    (await client(f, provider.instance, { planningSecret: undefined })("/generate", command()))
      .status,
    503,
  );
  assert.equal(
    (await client(f, provider.instance, { bearer: "invalid" })("/generate", command())).status,
    401,
  );
  assert.equal((await c("/generate", { ...command(), actorId: id(2) })).status, 400);
  assert.equal((await c("/generate?approved=true", command())).status, 400);
  assert.equal((await c(`?proposalId=${id(800)}&proposalId=${id(801)}`)).status, 400);
  assert.equal((await c("/recover", { proposalId: id(800), approved: true })).status, 400);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_proposals"), "0");
  assert.equal(provider.calls.length, 0);
  const ready = await (await c("/generate", command())).json(),
    p = ready.receipt.proposalId;
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await c("/generate", command())).status, 403);
  assert.equal((await c("/recover", { proposalId: p })).status, 403);
  assert.equal(provider.calls.length, 2);
});

test("lost worker claim acknowledgement never dispatches a model and recovers after the deadline", async (t) => {
  const f = await fixture(t),
    provider = model();
  const proxy = await lostResponseProxy(t, f.url, "/rest/v1/rpc/nest_claim_meal_proposal");
  const c = client({ ...f, url: proxy.url }, provider.instance);
  assert.equal((await c("/generate", command())).status, 503);
  assert.equal(proxy.dropped(), 1);
  const pending = await (await c("/generate", command())).json();
  assert.equal(pending.envelope.proposal.status, "generating");
  assert.equal(provider.calls.length, 0);
  f.db.sql(
    "update private.nest_meal_proposal_jobs set deadline_at=clock_timestamp()-interval '1 second'",
  );
  const recovered = await (await c("/recover", { proposalId: pending.receipt.proposalId })).json();
  assert.equal(recovered.proposal.failure, "unavailable");
  assert.equal((await (await c("/generate", command())).json()).envelope.proposal.status, "failed");
  assert.equal(provider.calls.length, 0);
});

test("request cancellation leaves recoverable work and late provider completion cannot publish", async (t) => {
  const f = await fixture(t);
  let release, started;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const provider = model(async (value, index) => {
    if (index === 1) {
      started();
      await gate;
    }
    return value;
  });
  const c = client(f, provider.instance),
    controller = new AbortController();
  const generating = c("/generate", command(), controller.signal);
  await entered;
  controller.abort();
  assert.equal((await generating).status, 503);
  release();
  const pending = await (await c("/generate", command())).json();
  assert.equal(pending.envelope.proposal.status, "generating");
  assert.equal(provider.calls.length, 1);
  f.db.sql(
    "update private.nest_meal_proposal_jobs set deadline_at=clock_timestamp()-interval '1 second'",
  );
  const recovered = await (await c("/recover", { proposalId: pending.receipt.proposalId })).json();
  assert.equal(recovered.proposal.failure, "unavailable");
  assert.equal(recovered.proposal.entries, null);
});

test("replayed reservation with changed constraints stops before provider dispatch", async (t) => {
  const f = await fixture(t),
    provider = model(),
    c = client(f, provider.instance);
  const { operationId, ...input } = command();
  const start = await fetch(`${f.url}/rest/v1/rpc/nest_begin_meal_proposal`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({ p_household: id(10), p_operation: operationId, p_input: input }),
  });
  assert.equal(start.status, 200);
  f.db.sql(`update public.nest_food_profiles set portions=2 where actor_id='${id(2)}'`);
  const result = await (await c("/generate", command())).json();
  assert.equal(result.envelope.proposal.failure, "constraints_changed");
  assert.equal(provider.calls.length, 0);
});

test("familiar-only with no complete recipes records an honest failure without model spend", async (t) => {
  const f = await fixture(t),
    provider = model(),
    c = client(f, provider.instance);
  f.db.sql("update public.meal_definitions set nest_instructions=null");
  const response = await c("/generate", { ...command(), familiarOnly: true });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).envelope.proposal.failure, "no_suitable_meals");
  assert.equal(provider.calls.length, 0);
});
