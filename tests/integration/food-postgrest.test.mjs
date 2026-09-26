import { files } from "./preference-files.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const preferences = {
  restrictions: ["Peanuts"],
  dislikes: ["Olives"],
  calorieGoal: 2200,
  portions: 1.5,
};
const command = { operationId: id(100), expectedRevision: "0", preferences };
function client(f, bearer = f.bearer) {
  const handler = createHandler({ url: f.url, publishableKey: "sb_publishable_fixture" });
  const headers = {
    authorization: `Bearer ${bearer}`,
    "content-type": "application/json",
    "x-nest-household": id(10),
  };
  return {
    read: () => handler(new Request("http://localhost/v1/food-preferences", { headers })),
    save: (input = command) =>
      handler(
        new Request("http://localhost/v1/food-preferences/save", {
          method: "POST",
          headers,
          body: JSON.stringify(input),
        }),
      ),
  };
}

test("profile API saves private fields, protects tenant identity and distinguishes unconfigured setup", async (t) => {
  const f = await postgrestFixture(t, files),
    owner = client(f),
    partner = client(f, f.partnerBearer);
  const initial = await owner.read();
  assert.equal(initial.headers.get("cache-control"), "no-store");
  assert.equal((await initial.json()).profile, null);
  const saved = await owner.save();
  assert.equal(saved.status, 200);
  const receipt = await saved.json();
  assert.equal(receipt.receipt.revision, "1");
  assert.deepEqual(await (await owner.save()).json(), receipt);
  const read = await (await owner.read()).json();
  assert.deepEqual(read.profile.preferences, preferences);
  assert.equal(read.actorId, id(1));
  assert.equal((await (await partner.read()).json()).profile, null);
  assert.equal((await client(f, f.otherBearer).read()).status, 403);
  assert.equal((await owner.save({ ...command, actorId: id(2) })).status, 400);
  assert.equal((await owner.save({ ...command, operationId: id(101) })).status, 409);
  assert.equal(
    (
      await owner.save({
        ...command,
        operationId: id(102),
        expectedRevision: "1",
        preferences: { ...preferences, calorieGoal: null },
      })
    ).status,
    200,
  );
  assert.equal((await (await owner.read()).json()).profile.preferences.calorieGoal, null);
});

test("profile save lost acknowledgment retries the exact command once and revocation hides saved values", async (t) => {
  const f = await postgrestFixture(t, files);
  const proxy = await lostResponseProxy(t, f.url, "/rest/v1/rpc/nest_save_food_profile");
  const owner = client({ ...f, url: proxy.url });
  assert.equal((await owner.save()).status, 503);
  assert.equal(proxy.dropped(), 1);
  assert.equal((await owner.save()).status, 200);
  assert.equal(f.db.sql("select count(*) from public.nest_food_profile_receipts"), "1");
  f.db.sql(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
  );
  assert.equal((await owner.read()).status, 403);
  assert.equal((await owner.save()).status, 403);
});

test("bounded profile body accepts valid multibyte preference lists and rejects oversized or invalid fields", async (t) => {
  const f = await postgrestFixture(t, files),
    owner = client(f);
  const values = Array.from({ length: 32 }, (_, n) => `${n}${"食".repeat(110)}`);
  const input = {
    ...command,
    preferences: { ...preferences, restrictions: values, dislikes: values },
  };
  assert.ok(Buffer.byteLength(JSON.stringify(input)) > 8192);
  assert.equal((await owner.save(input)).status, 200);
  assert.deepEqual((await (await owner.read()).json()).profile.preferences.restrictions, values);
  for (const fields of [
    { portions: 1.25 },
    { calorieGoal: 0 },
    { restrictions: [" "] },
    { extra: true },
    { dislikes: ["x".repeat(70000)] },
  ])
    assert.equal(
      (
        await owner.save({
          ...command,
          operationId: id(101),
          expectedRevision: "1",
          preferences: { ...preferences, ...fields },
        })
      ).status,
      400,
    );
  assert.equal(f.db.sql("select count(*) from public.nest_food_profile_receipts"), "1");
});
