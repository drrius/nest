import { createRequire } from "node:module";
import { expenseApiFixture } from "./expense-api-fixture.mjs";
import { recurringClient } from "../../apps/mobile/src/money/recurring-client.ts";
import { id, input } from "../api/recurring-transport-fixture.mjs";
export { id };
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
export const run = (effect) =>
  Effect.runPromise(effect.pipe(Effect.provideService(Fetch.Fetch, fetch)));
const files = [
  "20260921190528_native_recurring_cycle_planning",
  "20260921191101_native_recurring_mandates",
  "20260921191203_native_recurring_configuration_command",
  "20260921192022_native_recurring_reads",
  "20260921192950_native_recurring_save_recovery",
].map((name) => `supabase/migrations/${name}.sql`);
export async function recurringApiFixture(t, extraFiles = []) {
  const f = await expenseApiFixture(t, [...files, ...extraFiles]);
  const start = f.db.sql(
    "select to_char((clock_timestamp() at time zone 'Europe/Zurich')::date+30,'YYYY-MM-DD')",
  );
  const client = (url = f.url, actor = 1, token = f.bearer) =>
    recurringClient(
      url,
      { actor: id(actor), household: id(10) },
      Effect.succeed({ user: { id: id(actor) }, access_token: token }),
    );
  return { ...f, client, rule: input(start) };
}
