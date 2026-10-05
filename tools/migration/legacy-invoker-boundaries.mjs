import assert from "node:assert/strict";
import { captureRehearsal, compareRehearsal } from "./financial-rehearsal.mjs";
import { captureExcludedHistory } from "./excluded-rehearsal.mjs";
import { captureRenewalHistory } from "./renewal-rehearsal.mjs";
import { denyExcludedBoundary as deny } from "./legacy-excluded-boundary-runner.mjs";
import {
  excludedBoundaryId as id,
  excludedLiteral as quote,
} from "./legacy-excluded-boundary-calls.mjs";
import {
  invokerArchive as archive,
  invokerAttention as attention,
} from "./legacy-invoker-boundary-calls.mjs";
import { invokerFlows } from "./legacy-invoker-boundary-flows.mjs";

export function verifyLegacyInvokerBoundaries(db) {
  const finance = captureRehearsal(db),
    excluded = captureExcludedHistory(db),
    renewals = captureRenewalHistory(db),
    cases = [];
  archiveRefusals(db, cases);
  attentionRefusals(db, cases);
  invokerFlows(db, cases);
  assert.equal(compareRehearsal(finance, captureRehearsal(db)).passed, true);
  assert.equal(captureExcludedHistory(db), excluded);
  assert.equal(captureRenewalHistory(db), renewals);
  return {
    passed: true,
    cases,
    compiledFunctions: metadata(db),
    disposableOnly: true,
    originalFinancialExcludedAndRenewalRowsRetained: true,
    excludedFeaturesAddedToNative: false,
  };
}

function archiveRefusals(db, cases) {
  const name = "archive_household_decision_option_versioned";
  for (const actor of [10021, 10023, null])
    deny(db, cases, {
      name,
      actor,
      expression: archive(),
      reason: "foreign-or-absent-membership",
      expected: /Option not found/,
    });
  deny(db, cases, {
    name,
    expression: archive(),
    role: "anon",
    reason: "anonymous-execution",
    expected: /permission denied/,
  });
  const version = `${quote(db.sql(`select updated_at::text from public.decision_options where id='${id(1312)}'`))}::timestamptz`;
  for (const actor of [1, 2]) {
    for (const [options, reason, expected] of [
      [{ option: 10027 }, "known-foreign-option", /Option not found/],
      [{ version: "null" }, "missing-version", /An edit version is required/],
      [{}, "stale-version", /This option changed/],
      [{ archived: "null", version }, "missing-archive-state", /Choose an archive state/],
    ])
      deny(db, cases, { name, actor, expression: archive(options), reason, expected });
    deny(db, cases, {
      name,
      actor,
      expression: archive({ version }),
      reason: "edited-after-original-read",
      expected: /This option changed/,
      setup: `update public.decision_options set title='A later partner edit' where id='${id(1312)}';`,
    });
  }
}

function attentionRefusals(db, cases) {
  const name = "list_home_attention_records";
  deny(db, cases, {
    name,
    expression: attention(),
    role: "anon",
    reason: "anonymous-execution",
    expected: /permission denied/,
  });
  for (const actor of [1, 2])
    for (const [options, reason] of [
      [{ kind: null }, "missing-kind"],
      [{ kind: "unknown" }, "invalid-kind"],
      [{ page: null }, "missing-page"],
      [{ page: -1 }, "negative-page"],
      [{ page: 10001 }, "oversized-page"],
      [{ today: null }, "missing-date"],
      [{ today: "infinity" }, "nonfinite-date"],
      [{ today: "-infinity" }, "negative-nonfinite-date"],
    ])
      deny(db, cases, {
        name,
        actor,
        expression: attention(options),
        reason,
        expected: /Invalid attention query/,
      });
}

function metadata(db) {
  const rows = JSON.parse(
    db.sql(String.raw`select jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'signature',p.oid::regprocedure::text,'securityDefiner',p.prosecdef,
    'returnType',p.prorettype::regtype::text,'config',p.proconfig,
    'anonymousExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'serviceExecute',has_function_privilege('service_role',p.oid,'EXECUTE'),
    'bodySha256',encode(sha256(convert_to(btrim(p.prosrc,E' \n\r\t'),'UTF8')),'hex')) order by p.oid::regprocedure::text)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
      and p.proname in ('archive_household_decision_option_versioned','list_home_attention_records','nest_legacy_attention_deadline')`),
  );
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.securityDefiner, false);
    assert.deepEqual(row.config, ['search_path=""']);
    assert.equal(row.anonymousExecute, false);
    assert.equal(row.authenticatedExecute, true);
  }
  return rows;
}
