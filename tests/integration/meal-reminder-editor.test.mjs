import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run, Effect } from "./meal-reminder-native-fixture.mjs";
import { routineClient } from "../../apps/mobile/src/routines/client.ts";
import { reminderEditorContext } from "../../apps/mobile/src/meal-reminders/editor-context.ts";
import { reminderDraft, parseReminderDraft } from "../../apps/mobile/src/meal-reminders/form.ts";
import { reminderConfirmation } from "../../apps/mobile/src/meal-reminders/confirmation.ts";
function clients(f) {
  const account = { actor: id(1), household: id(10) };
  const credentials = Effect.succeed({ user: { id: id(1) }, access_token: f.bearer });
  return {
    routines: routineClient(f.url, account, credentials),
    reminders: f.native,
  };
}
test("reminder editor loads authorized choices and confirms exact settings through durable saving", async (t) => {
  const f = await fixture(t),
    api = clients(f),
    account = { store: f.local.store, session: f.session };
  const context = await run(reminderEditorContext(account, api, f.entryId));
  assert.equal(context.members.length, 2);
  assert.equal(context.reminder, null);
  const draft = {
    ...reminderDraft(null),
    enabled: true,
    recipientIds: [id(1), id(2)],
    localTime: "08:30",
    daysBefore: "7",
  };
  const runtime = await f.mount();
  const dialog = reminderConfirmation(
    { ...f.command, settings: parseReminderDraft(draft) },
    context,
    () => true,
    runtime.save,
  );
  assert.ok(dialog);
  assert.equal(await dialog.confirm(), true);
  const result = runtime.getSnapshot().result;
  assert.equal(result.status, "recorded");
  const loaded = await run(reminderEditorContext(account, api, f.entryId));
  assert.deepEqual(loaded.reminder.settings, parseReminderDraft(draft));
  assert.equal(
    reminderConfirmation(f.command, loaded, () => true, runtime.save),
    null,
  );
  await run(f.local.store.activate({ actor: id(2), household: id(10) }, id(999)));
  await assert.rejects(run(reminderEditorContext(account, api, f.entryId)));
  assert.equal(f.db.sql("select count(*) from public.nest_meal_week_revisions"), "0");
});
