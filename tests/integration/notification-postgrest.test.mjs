import { files } from "./preference-files.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const preferences = {
  dailySummaryEnabled: true,
  dailySummaryTime: "08:00",
  itemRemindersEnabled: false,
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
    read: () => handler(new Request("http://localhost/v1/notification-preferences", { headers })),
    save: (input = command) =>
      handler(
        new Request("http://localhost/v1/notification-preferences/save", {
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
        preferences: { ...preferences, dailySummaryEnabled: false },
      })
    ).status,
    200,
  );
  assert.equal((await (await owner.read()).json()).profile.preferences.dailySummaryEnabled, false);
});

test("profile save lost acknowledgment retries the exact command once and revocation hides saved values", async (t) => {
  const f = await postgrestFixture(t, files);
  const proxy = await lostResponseProxy(
    t,
    f.url,
    "/rest/v1/rpc/nest_save_notification_preferences",
  );
  const owner = client({ ...f, url: proxy.url });
  assert.equal((await owner.save()).status, 503);
  assert.equal(proxy.dropped(), 1);
  const direct = client(f);
  assert.equal(
    (
      await direct.save({
        ...command,
        operationId: id(101),
        expectedRevision: "1",
        preferences: { ...preferences, dailySummaryEnabled: false },
      })
    ).status,
    200,
  );
  assert.equal((await owner.save()).status, 200);
  assert.equal((await (await owner.read()).json()).profile.preferences.dailySummaryEnabled, false);
  assert.equal(f.db.sql("select count(*) from public.nest_notification_preference_receipts"), "2");
  f.db.sql(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
  );
  assert.equal((await owner.read()).status, 403);
  assert.equal((await owner.save()).status, 403);
});

test("invalid notification settings and oversized bodies fail without granting opt-in", async (t) => {
  const f = await postgrestFixture(t, files),
    owner = client(f);
  for (const fields of [
    { dailySummaryTime: "24:00" },
    { dailySummaryTime: "08:60" },
    { dailySummaryEnabled: null },
    { itemRemindersEnabled: "true" },
    { extra: true },
    { dailySummaryTime: "x".repeat(9000) },
  ])
    assert.equal(
      (await owner.save({ ...command, preferences: { ...preferences, ...fields } })).status,
      400,
    );
  assert.equal((await (await owner.read()).json()).profile, null);
  assert.equal(f.db.sql("select count(*) from public.nest_notification_preference_receipts"), "0");
});
