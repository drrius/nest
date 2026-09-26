import { files } from "./preference-files.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const preferences = { cookingNotes: "Quick weeknight meals", mealSlots: ["lunch", "dinner"] };
const command = { operationId: id(100), expectedRevision: "0", preferences };
function client(f, bearer = f.bearer) {
  const handler = createHandler({ url: f.url, publishableKey: "sb_publishable_fixture" });
  const headers = {
    authorization: `Bearer ${bearer}`,
    "content-type": "application/json",
    "x-nest-household": id(10),
  };
  return {
    read: () => handler(new Request("http://localhost/v1/cooking-preferences", { headers })),
    save: (input = command) =>
      handler(
        new Request("http://localhost/v1/cooking-preferences/save", {
          method: "POST",
          headers,
          body: JSON.stringify(input),
        }),
      ),
  };
}
test("real cooking API exposes only shared settings, accepts either member and preserves revision conflicts", async (t) => {
  const f = await postgrestFixture(t, files),
    first = client(f),
    second = client(f, f.partnerBearer);
  assert.equal((await (await first.read()).json()).profile, null);
  const saved = await first.save();
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get("cache-control"), "no-store");
  assert.deepEqual(await (await second.read()).json(), {
    version: 1,
    householdId: id(10),
    profile: { revision: "1", preferences },
  });
  assert.equal((await second.save()).status, 409);
  const changed = await second.save({
    ...command,
    expectedRevision: "1",
    preferences: { cookingNotes: "", mealSlots: ["breakfast", "dinner"] },
  });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).receipt.actorId, id(2));
  assert.equal((await (await first.read()).json()).profile.revision, "2");
  assert.equal((await client(f, f.otherBearer).read()).status, 403);
  for (const patch of [{ actorId: id(2) }, { householdId: id(20) }])
    assert.equal((await first.save({ ...command, ...patch })).status, 400);
});
test("lost cooking-save acknowledgment is replayed exactly and revocation blocks read and retry", async (t) => {
  const f = await postgrestFixture(t, files);
  const proxy = await lostResponseProxy(t, f.url, "/rest/v1/rpc/nest_save_cooking_preferences");
  const first = client({ ...f, url: proxy.url });
  assert.equal((await first.save()).status, 503);
  assert.equal(proxy.dropped(), 1);
  assert.equal((await first.save()).status, 200);
  assert.equal(f.db.sql("select count(*) from public.nest_cooking_preference_receipts"), "1");
  f.db.sql(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
  );
  assert.equal((await first.read()).status, 403);
  assert.equal((await first.save()).status, 403);
});
test("cooking API supports the complete bounded notes payload and rejects malformed slot sets", async (t) => {
  const f = await postgrestFixture(t, files),
    first = client(f);
  const full = { ...command, preferences: { ...preferences, cookingNotes: "\u0001".repeat(2000) } };
  assert.ok(Buffer.byteLength(JSON.stringify(full)) > 8192);
  assert.equal((await first.save(full)).status, 200);
  assert.equal(
    (await (await first.read()).json()).profile.preferences.cookingNotes,
    full.preferences.cookingNotes,
  );
  for (const patch of [
    { mealSlots: [] },
    { mealSlots: ["dinner", "dinner"] },
    { mealSlots: ["snack"] },
    { cookingNotes: "🥜".repeat(1001) },
    { calorieGoal: 2200 },
    { cookingNotes: "x".repeat(20000) },
  ])
    assert.equal(
      (
        await first.save({
          ...command,
          operationId: id(101),
          expectedRevision: "1",
          preferences: { ...preferences, ...patch },
        })
      ).status,
      400,
    );
  assert.equal(f.db.sql("select count(*) from public.nest_cooking_preference_receipts"), "1");
});
