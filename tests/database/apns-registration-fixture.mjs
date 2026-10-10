import { deliveryFixture, id, as, json } from "./push-delivery-fixture.mjs";
export { id, as, json };
export const migration = "supabase/migrations/20260929220335_native_apns_registration.sql";
export function apnsRegistrationFixture(t) {
  const f = deliveryFixture(t);
  f.db.file("supabase/migrations/20260923002812_native_push_delivery_outcomes.sql");
  f.db.file("supabase/migrations/20260922235848_native_push_cancellation.sql");
  const old = JSON.parse(
    f.db.sql(as(1, `select public.nest_read_push_device_operation('${id(10)}','${id(1701)}')`)),
  );
  f.db.file(migration);
  const request = (sql, actor = 1, session = 1700) =>
    as(actor, `set request.jwt.claims='${JSON.stringify({ session_id: id(session) })}'; ${sql}`);
  const execute = (sql, actor = 1, session = 1700) =>
    JSON.parse(f.db.sql(request(sql, actor, session)));
  const command = (operation = 2700, installation = 2701) => ({
    action: "register",
    provider: "apns",
    environment: "sandbox",
    token: "a1b2c3",
    operationId: id(operation),
    installationId: id(installation),
    expectedRevision: null,
  });
  const save = (value) => `select public.nest_save_push_device('${id(10)}',${json(value)})`;
  const read = (installation = 2701) =>
    `select public.nest_read_push_device('${id(10)}','${id(installation)}')`;
  const recover = (operation = 2700) =>
    `select public.nest_read_push_device_operation('${id(10)}','${id(operation)}')`;
  return { ...f, old, request, execute, command, save, read, recover };
}
