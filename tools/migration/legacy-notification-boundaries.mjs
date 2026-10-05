import assert from "node:assert/strict";
import { captureRehearsal, compareRehearsal } from "./financial-rehearsal.mjs";
import { captureExcludedHistory } from "./excluded-rehearsal.mjs";
import { denyNotificationBoundary as denied } from "./legacy-notification-boundary-runner.mjs";
import { notificationFlows } from "./legacy-notification-boundary-flows.mjs";
import {
  notificationBoundaryId as id,
  notificationRegister,
  notificationUnregister,
  notificationEnqueue,
  notificationRead,
  notificationMark,
  notificationDigest,
  notificationPause,
  notificationQuotaSeed,
} from "./legacy-notification-boundary-calls.mjs";

const calls = [
  ["register_push_subscription", notificationRegister()],
  ["unregister_push_subscription", notificationUnregister()],
  ["enqueue_self_device_push_test", notificationEnqueue()],
  ["read_self_device_push_test", notificationRead()],
  ["mark_inbox_notifications_read", notificationMark()],
  ["upsert_digest_preference", notificationDigest()],
  ["pause_my_push_for_signout", notificationPause],
];

export function verifyLegacyNotificationBoundaries(db) {
  const before = captureRehearsal(db),
    excluded = captureExcludedHistory(db);
  const notifications = captureNotifications(db),
    cases = [];
  accessRefusals(db, cases);
  inputRefusals(db, cases);
  deviceRefusals(db, cases);
  notificationFlows(db, cases);
  assert.equal(compareRehearsal(before, captureRehearsal(db)).passed, true);
  assert.equal(captureExcludedHistory(db), excluded);
  assert.equal(captureNotifications(db), notifications);
  return {
    passed: true,
    cases,
    compiledFunctions: metadata(db),
    compiledPolicies: policyMetadata(db),
    disposableOnly: true,
    originalFinancialNotificationAndExcludedRowsRetained: true,
    dispatcherExecuted: false,
    apnsDeliveryVerified: false,
    nativeOptInsCreated: false,
  };
}

function accessRefusals(db, cases) {
  for (const [name, expression] of calls) {
    denied(db, cases, {
      name,
      expression,
      actor: null,
      reason: "absent-identity",
      expected: /authentication required|Sign in|Household membership/i,
    });
    denied(db, cases, {
      name,
      expression,
      role: "anon",
      reason: "anonymous-execution",
      expected: /permission denied/,
    });
  }
  for (const [name, expression] of [calls[0], calls[2], calls[3], calls[5], calls[6]])
    denied(db, cases, {
      name,
      expression,
      actor: 9923,
      reason: "nonmember",
      expected: /member|not available/i,
    });
  for (const actor of [1, 2, 9921, 9923])
    for (const table of ["device_push_test_requests", "push_outbox"])
      denied(db, cases, {
        name: table,
        expression: `count(*) from public.${table}`,
        actor,
        reason: "private-test-or-dispatch-state-direct-read",
        expected: /permission denied/,
      });
}

function invalidInputs() {
  return [
    [
      "register_push_subscription",
      notificationRegister({ endpoint: null }),
      /required/,
      "missing-endpoint",
    ],
    [
      "register_push_subscription",
      notificationRegister({ endpoint: " " }),
      /required/,
      "blank-endpoint",
    ],
    [
      "register_push_subscription",
      notificationRegister({ endpoint: "x".repeat(4001) }),
      /required/,
      "oversized-endpoint",
    ],
    ["register_push_subscription", notificationRegister({ key: null }), /required/, "missing-key"],
    [
      "register_push_subscription",
      notificationRegister({ auth: null }),
      /required/,
      "missing-auth",
    ],
    [
      "register_push_subscription",
      notificationRegister({ key: "x".repeat(1001) }),
      /required/,
      "oversized-key",
    ],
    [
      "register_push_subscription",
      notificationRegister({ auth: "x".repeat(1001) }),
      /required/,
      "oversized-auth",
    ],
    [
      "unregister_push_subscription",
      notificationUnregister({ endpoint: null }),
      /required/,
      "missing-endpoint",
    ],
    [
      "unregister_push_subscription",
      notificationUnregister({ endpoint: " " }),
      /required/,
      "blank-endpoint",
    ],
    [
      "unregister_push_subscription",
      notificationUnregister({ endpoint: "x".repeat(4001) }),
      /required/,
      "oversized-endpoint",
    ],
    [
      "upsert_digest_preference",
      notificationDigest({ enabled: "null" }),
      /required/,
      "missing-enabled-state",
    ],
    ["upsert_digest_preference", notificationDigest({ time: "null" }), /required/, "missing-time"],
  ];
}

function inputRefusals(db, cases) {
  const variants = invalidInputs();
  for (const actor of [1, 2]) {
    for (const [name, expression, expected, reason] of variants)
      denied(db, cases, { name, expression, expected, reason, actor });
    for (const [name, build] of [
      ["enqueue_self_device_push_test", notificationEnqueue],
      ["read_self_device_push_test", notificationRead],
    ])
      for (const options of [
        { endpoint: null },
        { endpoint: "" },
        { endpoint: "x".repeat(4001) },
        { request: null },
      ])
        denied(db, cases, {
          name,
          expression: build(options),
          expected: /Invalid device test request/,
          reason: "invalid-test-request",
          actor,
        });
  }
}

function deviceRefusals(db, cases) {
  for (const actor of [2, 9921, 9923])
    denied(db, cases, {
      name: "register_push_subscription",
      expression: notificationRegister(),
      actor,
      reason: "other-member-endpoint-takeover",
      expected: /belongs to another member|not a household member/,
    });
  for (const actor of [1, 2]) {
    const ownDevice = actor === 1 ? 9931 : 9932,
      partnerDevice = actor === 1 ? 9932 : 9931;
    const ownRequest = actor === 1 ? 9945 : 9946,
      partnerRequest = actor === 1 ? 9946 : 9945;
    for (const [device, request] of [
      [partnerDevice, partnerRequest],
      [9934, 9947],
      [ownDevice, partnerRequest],
      [ownDevice, 9999],
    ])
      denied(db, cases, {
        name: "read_self_device_push_test",
        expression: notificationRead({ device, request }),
        actor,
        reason: "other-or-unknown-device-request",
        expected: /not available/,
      });
    for (const device of [partnerDevice, 9934])
      denied(db, cases, {
        name: "enqueue_self_device_push_test",
        expression: notificationEnqueue({ device }),
        actor,
        reason: "other-member-device",
        expected: /Enable push/,
      });
    denied(db, cases, {
      name: "enqueue_self_device_push_test",
      expression: notificationEnqueue({ device: ownDevice, request: partnerRequest }),
      actor,
      reason: "other-member-request-id",
      expected: /could not be used/,
    });
    denied(db, cases, {
      name: "enqueue_self_device_push_test",
      expression: notificationEnqueue({ device: ownDevice }),
      actor,
      setup: `update public.push_subscriptions set disabled_at=now() where id='${id(ownDevice)}';`,
      reason: "disabled-device-new-test",
      expected: /Enable push/,
    });
    denied(db, cases, {
      name: "enqueue_self_device_push_test",
      expression: notificationEnqueue({ device: ownDevice }),
      actor,
      setup: `update public.device_push_test_requests set created_at=now() where id='${id(ownRequest)}';`,
      reason: "one-minute-rate-limit",
      expected: /Wait one minute/,
    });
    denied(db, cases, {
      name: "enqueue_self_device_push_test",
      expression: notificationEnqueue({ device: ownDevice }),
      actor,
      setup: notificationQuotaSeed(actor),
      reason: "five-tests-rolling-day",
      expected: /Five tests/,
    });
  }
  deviceRetryRefusals(db, cases);
}

function deviceRetryRefusals(db, cases) {
  denied(db, cases, {
    name: "enqueue_self_device_push_test",
    expression: notificationEnqueue({ device: 9933, request: 9945 }),
    reason: "same-member-different-device-retry",
    expected: /could not be used/,
  });
  denied(db, cases, {
    name: "enqueue_self_device_push_test",
    expression: notificationEnqueue({ device: 9933 }),
    setup:
      notificationQuotaSeed() + `delete from public.push_subscriptions where id='${id(9931)}';`,
    reason: "device-deletion-preserves-quota",
    expected: /Five tests/,
  });
}

function captureNotifications(db) {
  const tables = [
    "inbox_notifications",
    "notification_digest_preferences",
    "push_subscriptions",
    "push_outbox",
    "device_push_test_requests",
  ];
  return db.sql(`select jsonb_build_object(${tables
    .map(
      (table) => `'${table}',
    (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') from public.${table} r)`,
    )
    .join(",")},
    'nativeDevices',(select count(*) from private.nest_push_devices),
    'nativePreferences',(select count(*) from public.nest_notification_preferences))`);
}

function metadata(db) {
  const names = calls.map(([name]) => name);
  const rows = JSON.parse(
    db.sql(String.raw`select jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'name',p.proname,'signature',p.oid::regprocedure::text,
    'bodySha256',encode(sha256(convert_to(btrim(p.prosrc,E' \n\r\t'),'UTF8')),'hex'),
    'securityDefiner',p.prosecdef,'config',p.proconfig,
    'anonymousExecute',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE')) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (${names.map((n) => `'${n}'`).join(",")})`),
  );
  assert.equal(rows.length, 7);
  for (const row of rows) {
    assert.deepEqual(row.config, ['search_path=""']);
    assert.equal(row.securityDefiner, true);
    assert.equal(row.anonymousExecute, false);
    assert.equal(row.authenticatedExecute, true);
  }
  return rows;
}

function policyMetadata(db) {
  const rows = JSON.parse(
    db.sql(`select jsonb_agg(jsonb_build_object(
    'name',policyname,'command',cmd,'roles',roles,'qual',qual,'check',with_check) order by policyname)
    from pg_policies where schemaname='public' and tablename='notification_digest_preferences'`),
  );
  assert.equal(rows.length, 3);
  const read = rows.find((row) => row.command === "SELECT");
  assert.equal(read.name, "members read own digest preferences");
  assert.deepEqual(read.roles, ["authenticated"]);
  assert.match(read.qual, /member_id = \( SELECT auth.uid\(\)/);
  assert.match(read.qual, /private.is_household_member\(household_id\)/);
  return rows;
}
