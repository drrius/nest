import { createRequire } from "node:module";
import { fixture as server, id, run } from "./meal-reminder-fixture.mjs";
import { fixture as sqlite } from "../../packages/protocol-fixtures/tests/offline-fixture.mjs";
import { mealReminderSaveOperations } from "../../packages/protocol-fixtures/src/meal-reminders/save-operations.ts";
import { MealReminderSaveRuntime } from "../../packages/protocol-fixtures/src/meal-reminders/save-runtime.ts";
export { id, run };
const require = createRequire(
  new URL("../../packages/protocol-fixtures/package.json", import.meta.url),
);
export const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
export async function fixture(t) {
  const f = await server(t),
    local = await sqlite(t);
  const session = await run(local.store.activate({ actor: id(1), household: id(10) }, id(950)));
  let fault = "none",
    sends = 0;
  const transport = async (input, init) => {
    const save = String(input).endsWith("/meal-reminders/save");
    if (save) {
      sends++;
      if (fault === "before") throw new TypeError("not sent");
    }
    const response = await fetch(input, init);
    if (save && fault === "after") throw new TypeError("lost acknowledgment");
    return response;
  };
  const client = Object.fromEntries(
    ["save", "recover", "cancel"].map((key) => [
      key,
      (input) => f.native[key](input).pipe(Effect.provideService(Fetch.Fetch, transport)),
    ]),
  );
  const operations = (store = local.store) =>
    mealReminderSaveOperations({ store, session }, client);
  const mount = async (store = local.store) => {
    const runtime = new MealReminderSaveRuntime(operations(store));
    t.after(() => runtime.dispose());
    await runtime.setOnline(true);
    await runtime.setActive(true);
    return runtime;
  };
  return {
    ...f,
    local,
    session,
    client,
    operations,
    mount,
    sends: () => sends,
    fault: (value) => {
      fault = value;
    },
  };
}
