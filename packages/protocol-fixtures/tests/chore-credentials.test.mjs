import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
import { sessionCredentials } from "../src/session/credentials.ts";
import { choreClient } from "../src/chores/client.ts";
import { choreFlow } from "../src/chores/flow.ts";
import { choreRuntime } from "../src/chores/runtime.ts";
import { fixture, run, account, target, operation } from "./offline-fixture.mjs";
const chore = { occurrenceId: target, dueDate: "2026-09-20", title: "Plants", assigneeId: null };

test("transient credential refresh or storage failures preserve warm offline enqueue; confirmed loss blocks it", async (t) => {
  const { store, session } = await fixture(t);
  await run(store.saveChores(session, [chore]));
  let mode = "refresh";
  const auth = {
    getSession: async () => {
      if (mode === "storage") throw new Error("Fixture Keychain unavailable");
      return {
        data: { session: null },
        error: mode === "refresh" ? new AuthRetryableFetchError("Fixture offline", 503) : null,
      };
    },
  };
  const client = choreClient("https://unused.example/", account, sessionCredentials(auth));
  const views = [];
  const runtime = choreRuntime(choreFlow(store, session, client), (view) => views.push(view));
  t.after(() => runtime.dispose());
  await runtime.refresh();
  assert.equal(views.at(-1).access, "allowed");
  assert.equal(views.at(-1).data.loaded, true);
  mode = "storage";
  await runtime.refresh();
  assert.equal(views.at(-1).access, "allowed");
  await runtime.complete(chore, operation, "2026-09-20");
  await runtime.refresh();
  assert.equal((await run(store.readChores(session))).pending.length, 1);
  mode = "missing";
  await runtime.refresh();
  assert.equal(views.at(-1).access, "verify");
  mode = "refresh";
  await runtime.refresh();
  assert.equal(views.at(-1).access, "verify");
});

test("confirmed SDK credential rejection is distinct from transient unavailability", async () => {
  for (const error of [
    new AuthSessionMissingError(),
    new AuthApiError("Rejected", 400, "refresh_token_not_found"),
    new AuthApiError("Rejected", 401, "bad_jwt"),
    new AuthApiError("Rejected", 403, "bad_jwt"),
  ]) {
    await assert.rejects(
      run(sessionCredentials({ getSession: async () => ({ data: { session: null }, error }) })),
      { code: "session" },
    );
  }
});
