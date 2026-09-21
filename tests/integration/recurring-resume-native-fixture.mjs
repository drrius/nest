import { createRequire } from "node:module";
import { recurringApiFixture, id, run } from "./recurring-api-fixture.mjs";
import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { RecurringReadRuntime } from "../../apps/mobile/src/money/recurring-read-runtime.ts";
import { recurringReadOperations } from "../../apps/mobile/src/money/recurring-read-operations.ts";
import { RecurringStateSaveRuntime } from "../../apps/mobile/src/money/recurring-state-save-runtime.ts";
import { recurringStateSaveOperations } from "../../apps/mobile/src/money/recurring-state-save-operations.ts";
import { prepareRecurringResume } from "../../apps/mobile/src/money/recurring-resume-confirmation.ts";
import { stateConfirmationCurrent } from "../../apps/mobile/src/money/recurring-state-confirmation.ts";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
export { id, run };
export async function fixture(t) {
  const f = await recurringApiFixture(t, [
    "supabase/migrations/20260921210444_native_recurring_state_command.sql",
    "supabase/migrations/20260921211106_native_recurring_state_recovery.sql",
    "supabase/migrations/20260921215304_native_recurring_resume_command.sql",
  ]);
  const saved = await run(f.client().saveRecurring({ operationId: id(600), rule: f.rule }));
  await run(
    f.client().saveRecurringState({
      operationId: id(601),
      change: {
        ruleId: f.rule.ruleId,
        expectedRevision: saved.revision,
        expectedStatus: "active",
        action: "pause",
      },
    }),
  );
  const local = await sqlite(t);
  const session = await run(local.store.activate({ actor: id(1), household: id(10) }, id(900)));
  let sends = 0;
  function owners(store = local.store, url = f.url) {
    const client = Object.fromEntries(
      Object.entries(f.client(url)).map(([key, method]) => [
        key,
        (...args) => {
          if (key === "saveRecurringResume" || key === "cancelRecurringResumeSave") sends++;
          return method(...args).pipe(Effect.provideService(Fetch.Fetch, fetch));
        },
      ]),
    );
    const account = { store, session };
    const read = new RecurringReadRuntime(recurringReadOperations(account, client), {
      kind: "detail",
      ruleId: f.rule.ruleId,
    });
    const save = new RecurringStateSaveRuntime(recurringStateSaveOperations(account, client));
    t.after(() => {
      read.dispose();
      save.dispose();
    });
    return { read, save };
  }
  const start = async ({ read, save }) => {
    await read.setOnline(true);
    await read.setActive(true);
    await save.setOnline(true);
    await save.setActive(true);
  };
  const capture = ({ read }) => {
    const { rule, today } = read.getSnapshot().entry.value;
    return prepareRecurringResume(rule, today, id(700));
  };
  const confirm = async ({ read, save }, expected) => {
    if (stateConfirmationCurrent(expected, read.getSnapshot(), save.getSnapshot()))
      await save.save(expected.command);
  };
  return { ...f, local, session, owners, start, capture, confirm, sends: () => sends };
}
