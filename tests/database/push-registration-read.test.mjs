import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, json, as } from "./renewal-fixture.mjs";
import { createRequire } from "node:module";
import {
  PushDeviceState,
  PushDeviceRecovery,
} from "../../packages/contracts/src/push-registration.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
test("registration reads recover only owner receipts and never expose tokens", (t) => {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260922223732_native_push_registration.sql");
  const command = {
    operationId: id(970),
    installationId: id(971),
    expectedRevision: null,
    action: "register",
    token: "ExponentPushToken[ReadFixture]",
  };
  const read = (sql, schema, actor = 1) =>
    Schema.decodeUnknownSync(schema)(JSON.parse(f.db.sql(as(actor, sql))), {
      onExcessProperty: "error",
    });
  const stateSql = `select public.nest_read_push_device('${id(10)}','${command.installationId}')`;
  const operationSql = `select public.nest_read_push_device_operation('${id(10)}','${command.operationId}')`;
  assert.equal(read(stateSql, PushDeviceState).revision, null);
  assert.equal(read(operationSql, PushDeviceRecovery).status, "unresolved");
  f.db.sql(as(1, `select public.nest_save_push_device('${id(10)}',${json(command)})`));
  const state = read(stateSql, PushDeviceState);
  assert.equal(state.enabled, true);
  assert.equal(JSON.stringify(state).includes(command.token), false);
  const recovery = read(operationSql, PushDeviceRecovery);
  assert.equal(recovery.status, "recorded");
  assert.equal(recovery.receipt.revision, state.revision);
  assert.equal(JSON.stringify(recovery).includes(command.token), false);
  assert.equal(read(stateSql, PushDeviceState, 2).revision, null);
  assert.equal(read(operationSql, PushDeviceRecovery, 2).status, "unresolved");
  assert.throws(() => read(stateSql, PushDeviceState, 3), /Membership required/);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => read(stateSql, PushDeviceState), /Membership required/);
  assert.throws(() => read(operationSql, PushDeviceRecovery), /Membership required/);
});
