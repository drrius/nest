import { fixture, id, json } from "./recurring-push-fixture.mjs";
import { as } from "./push-delivery-fixture.mjs";
export { id, json };
export const apnsOutcomesMigration =
  "supabase/migrations/20260929221917_native_apns_delivery_outcomes.sql";
export function apnsDeliveryFixture(t, seedLedger = false, beforeApns) {
  const f = fixture(t);
  if (seedLedger) f.seed("apns-ledger-fixture", 101, 51);
  f.db.file("supabase/migrations/20260923005427_native_push_worker_rpc.sql");
  beforeApns?.(f.db);
  f.db.file("supabase/migrations/20260922235848_native_push_cancellation.sql");
  f.db.file("supabase/migrations/20260929220335_native_apns_registration.sql");
  f.db.file(apnsOutcomesMigration);
  const execute = (sql) =>
    JSON.parse(
      f.db.sql(
        as(
          1,
          `set request.jwt.claims='${JSON.stringify({ sub: id(1), session_id: id(1700) })}'; ${sql}`,
        ),
      ),
    );
  const command = {
    action: "register",
    provider: "apns",
    environment: "sandbox",
    token: "a1b2c3",
    operationId: id(2800),
    installationId: id(1702),
    expectedRevision: f.db.sql(
      `select revision from private.nest_push_devices where installation_id='${id(1702)}'`,
    ),
  };
  const save = (value) => `select public.nest_save_push_device('${id(10)}',${json(value)})`;
  execute(save(command));
  const beginApns = (delivery, environment = "sandbox") => {
    const value = f.db.sql(
      `set role service_role; select public.nest_begin_apns_delivery('${delivery}','${environment}')`,
    );
    return value ? JSON.parse(value) : null;
  };
  const finish = (delivery, attempt, result) =>
    JSON.parse(
      f.db.sql(
        `set role service_role; select public.nest_finish_apns_send('${delivery}','${attempt}',${json(result)})`,
      ),
    );
  const providerState = () =>
    f.db.sql(`select jsonb_build_object(
    'devices',(select jsonb_agg(to_jsonb(d) order by installation_id) from private.nest_push_devices d),
    'deliveries',(select jsonb_agg(to_jsonb(d) order by id) from private.nest_push_deliveries d),
    'outcomes',(select jsonb_agg(to_jsonb(d) order by attempt_id) from private.nest_push_send_results d))`);
  const financialState = () =>
    f.db.sql(`select jsonb_build_object(
    'events',(select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e),
    'allocations',(select jsonb_agg(to_jsonb(e) order by id) from public.financial_allocations e),
    'ledger',(select jsonb_agg(to_jsonb(e) order by id) from public.ledger_entries e))`);
  return { ...f, execute, command, save, beginApns, finish, providerState, financialState };
}
