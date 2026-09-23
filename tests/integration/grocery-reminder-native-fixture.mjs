import { createRequire } from "node:module";
import { fixture as server, id, run } from "./grocery-reminder-fixture.mjs";
import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { groceryReminderSaveOperations } from "../../apps/mobile/src/grocery-reminders/save-operations.ts";
import { GroceryReminderSaveRuntime } from "../../apps/mobile/src/grocery-reminders/save-runtime.ts";
export { id, run };
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
export const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
export async function fixture(t) {
  const f = await server(t),
    local = await sqlite(t);
  const session = await run(local.store.activate({ actor: id(1), household: id(10) }, id(950)));
  let fault = "none",
    sends = 0;
  const transport = async (input, init) => {
    const save = String(input).endsWith("/grocery-reminders/save");
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
    groceryReminderSaveOperations({ store, session }, client);
  const mount = async (store = local.store) => {
    const runtime = new GroceryReminderSaveRuntime(operations(store));
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
