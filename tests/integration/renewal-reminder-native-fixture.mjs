import { renewalReminderClient } from "../../apps/mobile/src/renewal-reminders/client.ts";
import { createRequire } from "node:module";
import { fixture as server, id, run } from "./renewal-fixture.mjs";
import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { renewalReminderSaveOperations } from "../../apps/mobile/src/renewal-reminders/save-operations.ts";
import { RenewalReminderSaveRuntime } from "../../apps/mobile/src/renewal-reminders/save-runtime.ts";
export { id, run };
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
export const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
export async function fixture(t) {
  const f = await server(t, [
      "supabase/migrations/20260922213246_native_renewal_reminder_storage.sql",
    ]),
    local = await sqlite(t);
  const saved = await run(f.native.save(f.command));
  f.command = {
    operationId: id(960),
    renewalId: id(900),
    expectedRenewalRevision: saved.renewal.revision,
    expectedRevision: null,
    settings: {
      anchor: "renewal",
      delivery: { enabled: true, recipientIds: [id(1)], localTime: "08:30", daysBefore: 7 },
    },
  };
  f.native = renewalReminderClient(
    f.url,
    { actor: id(1), household: id(10) },
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  const session = await run(local.store.activate({ actor: id(1), household: id(10) }, id(950)));
  let fault = "none",
    sends = 0;
  const transport = async (input, init) => {
    const save = String(input).endsWith("/renewal-reminders/save");
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
    renewalReminderSaveOperations({ store, session }, client);
  const mount = async (store = local.store) => {
    const runtime = new RenewalReminderSaveRuntime(operations(store));
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
