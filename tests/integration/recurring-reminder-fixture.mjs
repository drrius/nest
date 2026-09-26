import { createRequire } from "node:module";
import { fixture as database, id } from "../database/recurring-reminder-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { recurringReminderClient } from "../../apps/mobile/src/recurring-reminders/client.ts";
export { id };
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
export const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
export const run = (effect) =>
  Effect.runPromise(effect.pipe(Effect.provideService(Fetch.Fetch, fetch)));
export async function fixture(t) {
  const cleanup = [];
  const scoped = { after: (fn) => cleanup.push(fn) };
  t.after(async () => {
    for (const fn of cleanup.reverse()) await fn();
  });
  const f = database(scoped);
  f.db.file(
    "supabase/migrations/20260926102727_native_recurring_reminder_nonretryable_conflicts.sql",
  );
  const remote = await postgrestFixture(scoped, ["tests/integration/food-postgrest.sql"], f.db);
  const config = { url: remote.url, publishableKey: "sb_publishable_fixture" };
  const server = nodeServer(createHandler(config));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  scoped.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}`;
  const client = (actor = 1, token = remote.bearer) =>
    recurringReminderClient(
      url,
      { actor: id(actor), household: id(10) },
      Effect.succeed({ user: { id: id(actor) }, access_token: token }),
    );
  const command = { operationId: id(2000), ...f.input };
  return {
    ruleId: f.input.ruleId,
    ...f,
    ...remote,
    config,
    url,
    client,
    native: client(),
    command,
  };
}
