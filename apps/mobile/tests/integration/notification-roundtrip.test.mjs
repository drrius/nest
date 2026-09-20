import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { nodeServer } from "../../../api/node-server.mjs";
import { createHandler } from "../../../api/src/handler.ts";
import { postgrestFixture } from "../../../../tests/integration/postgrest-fixture.mjs";
import { lostResponseProxy } from "../../../../tests/integration/lost-response-proxy.mjs";
import { notificationClient } from "../../src/notifications/client.ts";
import { NotificationRuntime } from "../../src/notifications/runtime.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const preferences = {
  dailySummaryEnabled: true,
  dailySummaryTime: "08:00",
  itemRemindersEnabled: false,
};
async function backend(t) {
  const remote = await postgrestFixture(t, [
    "tests/database/conversation-fixture.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260920072531_native_notification_preferences.sql",
  ]);
  const server = nodeServer(
    createHandler({ url: remote.url, publishableKey: "sb_publishable_fixture" }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}/`;
  const connect = (address = url, actor = id(1), bearer = remote.bearer) =>
    notificationClient(
      address,
      { actor, household: id(10) },
      Effect.succeed({ user: { id: actor }, access_token: bearer }),
    );
  return { remote, url, connect };
}
test("lost save acknowledgment reloads a newer opt-out from another device without restoring old consent", async (t) => {
  const { remote, url, connect } = await backend(t);
  const proxy = await lostResponseProxy(t, url, "/v1/notification-preferences/save");
  const first = new NotificationRuntime(connect(proxy.url), () => id(100));
  const otherDevice = new NotificationRuntime(connect(url), () => id(101));
  t.after(() => {
    first.dispose();
    otherDevice.dispose();
  });
  await first.load();
  assert.equal(first.getSnapshot().profile, null);
  const privatePartner = connect(url, id(2), remote.partnerBearer);
  assert.equal(await Effect.runPromise(privatePartner.read()), null);
  await first.save(preferences);
  assert.equal(proxy.dropped(), 1);
  assert.equal(first.getSnapshot().stage, "uncertain");
  await otherDevice.load();
  assert.equal(otherDevice.getSnapshot().profile.revision, "1");
  const changed = {
    dailySummaryEnabled: false,
    dailySummaryTime: "19:30",
    itemRemindersEnabled: true,
  };
  await otherDevice.save(changed);
  assert.equal(otherDevice.getSnapshot().profile.revision, "2");
  assert.equal(await Effect.runPromise(privatePartner.read()), null);
  await first.retry();
  assert.equal(first.getSnapshot().stage, "form");
  assert.deepEqual(first.getSnapshot().profile, { revision: "2", preferences: changed });
  assert.equal(
    remote.db.sql("select count(*) from public.nest_notification_preference_receipts"),
    "2",
  );
  first.dispose();
  const reopened = new NotificationRuntime(connect(), () => id(102));
  t.after(() => reopened.dispose());
  await reopened.load();
  assert.deepEqual(reopened.getSnapshot().profile, otherDevice.getSnapshot().profile);
});
test("native notification forms expose own-device conflicts and clear state on lost household access", async (t) => {
  const { remote, url, connect } = await backend(t);
  const first = new NotificationRuntime(connect(), () => id(100));
  const otherDevice = new NotificationRuntime(connect(url), () => id(101));
  t.after(() => {
    first.dispose();
    otherDevice.dispose();
  });
  await first.load();
  await otherDevice.load();
  await first.save(preferences);
  await otherDevice.save({ ...preferences, dailySummaryTime: "19:30" });
  assert.equal(otherDevice.getSnapshot().stage, "conflict");
  await otherDevice.save(preferences);
  assert.equal(
    remote.db.sql("select count(*) from public.nest_notification_preference_receipts"),
    "1",
  );
  await otherDevice.load();
  assert.deepEqual(otherDevice.getSnapshot().profile.preferences, preferences);
  remote.db.sql(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
  );
  await otherDevice.load();
  assert.equal(otherDevice.getSnapshot().stage, "verify");
  assert.equal(otherDevice.getSnapshot().profile, null);
  await otherDevice.save(preferences);
  assert.equal(
    remote.db.sql("select count(*) from public.nest_notification_preference_receipts"),
    "1",
  );
});
