import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { expenseEntryOptions } from "../src/money/entry-options.ts";
import { fixture, run, account } from "./offline-fixture.mjs";
import { id } from "../../../tests/database/native-expense-helpers.mjs";
test(
  "entry choices cannot escape a replaced account lease after a remote response",
  { timeout: 3000 },
  async (t) => {
    const f = await fixture(t);
    let entered = false,
      finish;
    const client = {
      balance: () =>
        Effect.callback((resume) => {
          entered = true;
          finish = () => resume(Effect.succeed({ members: [] }));
        }),
      categories: () => Effect.succeed({ categories: [] }),
    };
    const pending = run(expenseEntryOptions({ store: f.store, session: f.session }, client, null));
    while (!entered) await new Promise((resolve) => setImmediate(resolve));
    await run(f.store.activate({ ...account, actor: id(2) }, id(3)));
    finish();
    await assert.rejects(pending, { reason: "session_changed" });
  },
);
