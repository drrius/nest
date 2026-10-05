import assert from "node:assert/strict";
import { runNotificationBoundary as run } from "./legacy-notification-boundary-runner.mjs";
import {
  notificationBoundaryId as id,
  notificationRegister,
  notificationUnregister,
  notificationEnqueue,
  notificationRead,
  notificationMark,
  notificationDigest,
  notificationPause,
  notificationEndpoint,
  notificationLiteral as quote,
} from "./legacy-notification-boundary-calls.mjs";

function otherState(actor) {
  const tables = [
    ["push_subscriptions", "member_id"],
    ["notification_digest_preferences", "member_id"],
    ["inbox_notifications", "recipient_member_id"],
    ["push_outbox", "recipient_member_id"],
    ["device_push_test_requests", "member_id"],
  ];
  return `jsonb_build_object(${tables
    .map(
      ([table, member]) => `'${table}',
    (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')
      from public.${table} r where ${member}<>'${id(actor)}')`,
    )
    .join(",")})`;
}

function financialState() {
  return `jsonb_build_object(${["financial_events", "financial_allocations", "ledger_entries"]
    .map(
      (table) => `'${table}',
    (select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.${table} r)`,
    )
    .join(",")})`;
}

function tableState(table) {
  return `(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.${table} r)`;
}

function flow(db, actor, { commands, observation, setup = "" }) {
  const rows = run(
    db,
    actor,
    `${commands.map((command) => `select ${command};`).join("\n")}
    reset role; select jsonb_build_object('state',${observation},
      'otherStateUnchanged',(select body=${otherState(actor)} from notification_boundary_other_state),
      'financialUnchanged',(select body=${financialState()} from notification_boundary_financial_state),
      'nativeDevices',(select count(*) from private.nest_push_devices),
      'nativePreferences',(select count(*) from public.nest_notification_preferences))`,
    {
      setup: `${setup} create temporary table notification_boundary_other_state as select ${otherState(actor)} body;
      create temporary table notification_boundary_financial_state as select ${financialState()} body;
      create temporary table notification_boundary_inbox_state as select ${tableState("inbox_notifications")} body;
      create temporary table notification_boundary_outbox_state as select ${tableState("push_outbox")} body;`,
    },
  )
    .split("\n")
    .map((row) => JSON.parse(row));
  const observed = rows.pop();
  assert.equal(observed.otherStateUnchanged, true);
  assert.equal(observed.financialUnchanged, true);
  assert.equal(observed.nativeDevices, 0);
  assert.equal(observed.nativePreferences, 0);
  assert.equal(rows.length, commands.length);
  return { results: rows, observed };
}

function record(cases, name, actor, value) {
  cases.push({ function: name, actor, ...value });
}

export function notificationFlows(db, cases) {
  for (const actor of [1, 2]) {
    const device = actor === 1 ? 9931 : 9932,
      request = actor === 1 ? 9945 : 9946;
    registrationFlows(db, cases, { actor, device });
    unregisterFlow(db, cases, { actor, device });
    pauseFlow(db, cases, { actor, device, request });
    enqueueFlow(db, cases, { actor, device });
    statusFlows(db, cases, { actor, device, request });
    markFlows(db, cases, actor);
    digestFlow(db, cases, actor);
  }
  noOpFlows(db, cases);
  privacyFlows(db, cases);
  pruneFlow(db, cases);
}

function registrationFlows(db, cases, { actor, device }) {
  for (const fresh of [false, true]) {
    const target = fresh ? 9990 : device;
    const command = notificationRegister({
      device: target,
      key: " Synthetic replacement ",
      auth: " Synthetic replacement auth ",
    });
    const value = flow(db, actor, {
      commands: [command, command],
      setup: `update public.push_subscriptions set disabled_at=now() where id='${id(device)}';`,
      observation: `jsonb_build_object('matches',(select count(*) from public.push_subscriptions
        where endpoint=${quote(notificationEndpoint(target))} and member_id='${id(actor)}' and disabled_at is null
          and p256dh='Synthetic replacement' and auth='Synthetic replacement auth'))`,
    });
    assert.deepEqual(value.results[0], value.results[1]);
    assert.equal(value.results[0].disabled, false);
    assert.equal(value.observed.state.matches, 1);
    record(cases, "register_push_subscription", actor, {
      reason: fresh ? "new-endpoint-repeat-one-row" : "explicit-reenable-own-endpoint-repeat",
      ...value,
    });
  }
}

function unregisterFlow(db, cases, { actor, device }) {
  const command = notificationUnregister({ device });
  const value = flow(db, actor, {
    commands: [command, command],
    observation: `jsonb_build_object(
    'disabled',(select disabled_at is not null from public.push_subscriptions where id='${id(device)}'),
    'retained',(select count(*) from public.push_subscriptions where id='${id(device)}'))`,
  });
  assert.deepEqual(value.results, [{ disabled: 1 }, { disabled: 1 }]);
  assert.deepEqual(value.observed.state, { disabled: true, retained: 1 });
  record(cases, "unregister_push_subscription", actor, {
    reason: "disable-own-endpoint-repeat-keeps-record",
    ...value,
  });
}

function pauseFlow(db, cases, { actor, device, request }) {
  const value = flow(db, actor, {
    commands: [notificationPause, notificationPause, notificationEnqueue({ device, request })],
    observation: `jsonb_build_object('enabledOwn',(select count(*) from public.push_subscriptions
      where member_id='${id(actor)}' and disabled_at is null),
      'outboxUnchanged',(select body=${tableState("push_outbox")} from notification_boundary_outbox_state))`,
  });
  assert.deepEqual(value.results.slice(0, 2), [{ disabled: actor === 1 ? 2 : 1 }, { disabled: 0 }]);
  assert.deepEqual(value.results[2], { id: id(request), status: "queued" });
  assert.deepEqual(value.observed.state, { enabledOwn: 0, outboxUnchanged: true });
  record(cases, "pause_my_push_for_signout", actor, {
    reason: "all-own-devices-only-pause-retains-old-receipt",
    ...value,
  });
}

function enqueueFlow(db, cases, { actor, device }) {
  const command = notificationEnqueue({ device });
  const value = flow(db, actor, {
    commands: [command, command, notificationRead({ device, request: 9948 })],
    observation: `jsonb_build_object('requests',(select count(*) from public.device_push_test_requests
      where id='${id(9948)}' and member_id='${id(actor)}'),
      'outbox',(select count(*) from public.push_outbox where id='${id(9948)}' and recipient_member_id='${id(actor)}'),
      'inboxUnchanged',(select body=${tableState("inbox_notifications")} from notification_boundary_inbox_state))`,
  });
  for (const result of value.results) assert.deepEqual(result, { id: id(9948), status: "queued" });
  assert.deepEqual(value.observed.state, { requests: 1, outbox: 1, inboxUnchanged: true });
  record(cases, "enqueue_self_device_push_test", actor, {
    reason: "one-private-request-repeat-no-inbox-activity",
    ...value,
  });
}

function statusFlows(db, cases, { actor, device, request }) {
  for (const [status, expected] of [
    ["pending", "queued"],
    ["sent", "accepted"],
    ["failed", "failed"],
    ["skipped_no_subscription", "failed"],
  ]) {
    const value = flow(db, actor, {
      commands: [notificationRead({ device, request })],
      observation: "'{}'::jsonb",
      setup: `update public.push_outbox set status='${status}' where id='${id(request)}';`,
    });
    assert.deepEqual(value.results[0], { id: id(request), status: expected });
    record(cases, "read_self_device_push_test", actor, {
      reason: `status-envelope-${status}`,
      ...value,
    });
  }
}

function markFlows(db, cases, actor) {
  const own = actor === 1 ? 9941 : 9942;
  const command = notificationMark();
  for (const alreadyRead of [false, true]) {
    const value = flow(db, actor, {
      commands: [command, command],
      setup: alreadyRead
        ? `update public.inbox_notifications set read_at='2000-01-01T00:00:00Z' where id='${id(own)}';`
        : "",
      observation: `jsonb_build_object('read',(select read_at is not null from public.inbox_notifications where id='${id(own)}'),
        'oldReadPreserved',(select read_at='2000-01-01T00:00:00Z' from public.inbox_notifications where id='${id(own)}'))`,
    });
    assert.deepEqual(value.results, [{ marked: 1 }, { marked: 1 }]);
    assert.equal(value.observed.state.read, true);
    assert.equal(value.observed.state.oldReadPreserved, alreadyRead);
    record(cases, "mark_inbox_notifications_read", actor, {
      reason: alreadyRead
        ? "repeat-preserves-earlier-read-time"
        : "mixed-tenant-ids-mark-only-self",
      ...value,
    });
  }
}

function digestFlow(db, cases, actor) {
  const command = notificationDigest();
  const value = flow(db, actor, {
    commands: [command, command],
    observation: `jsonb_build_object(
    'preferences',(select jsonb_agg(jsonb_build_object('enabled',enabled,'time',local_time))
      from public.notification_digest_preferences where member_id='${id(actor)}'))`,
  });
  assert.deepEqual(value.results[0], value.results[1]);
  assert.equal(value.results[0].member_id, id(actor));
  assert.equal(value.results[0].household_id, id(10));
  assert.deepEqual(value.observed.state.preferences, [{ enabled: false, time: "06:45:00" }]);
  record(cases, "upsert_digest_preference", actor, {
    reason: "self-only-preference-repeat-no-native-opt-in",
    ...value,
  });
}

function noOpFlows(db, cases) {
  for (const actor of [2, 9921, 9923]) {
    const value = flow(db, actor, {
      commands: [notificationUnregister()],
      observation: "'{}'::jsonb",
    });
    assert.deepEqual(value.results[0], { disabled: 0 });
    record(cases, "unregister_push_subscription", actor, {
      reason: "other-endpoint-inert",
      ...value,
    });
  }
  for (const actor of [9921, 9923]) {
    const value = flow(db, actor, {
      commands: [notificationMark([9941, 9942, 9999])],
      observation: "'{}'::jsonb",
    });
    assert.deepEqual(value.results[0], { marked: 0 });
    record(cases, "mark_inbox_notifications_read", actor, {
      reason: "foreign-or-nonmember-mark-inert",
      ...value,
    });
  }
  const value = flow(db, 1, {
    commands: [notificationMark([]), "public.mark_inbox_notifications_read(null)"],
    observation: "'{}'::jsonb",
  });
  assert.deepEqual(value.results, [{ marked: 0 }, { marked: 0 }]);
  record(cases, "mark_inbox_notifications_read", 1, {
    reason: "empty-and-null-ids-inert",
    ...value,
  });
}

function privacyFlows(db, cases) {
  for (const [actor, subscriptions] of [
    [1, 2],
    [2, 1],
    [9921, 1],
    [9923, 0],
  ]) {
    const value = flow(db, actor, {
      commands: [
        `jsonb_build_object(
      'subscriptions',(select count(*) from public.push_subscriptions),
      'knownInbox',(select count(*) from public.inbox_notifications where id in ('${id(9941)}','${id(9942)}','${id(9943)}')),
      'preferences',(select count(*) from public.notification_digest_preferences),
      'foreignSubscriptions',(select count(*) from public.push_subscriptions where member_id<>auth.uid()),
      'foreignInbox',(select count(*) from public.inbox_notifications where recipient_member_id<>auth.uid()),
      'foreignPreferences',(select count(*) from public.notification_digest_preferences where member_id<>auth.uid()))`,
      ],
      observation: "'{}'::jsonb",
    });
    assert.deepEqual(value.results[0], {
      subscriptions,
      knownInbox: actor === 9923 ? 0 : 1,
      preferences: actor === 9923 ? 0 : 1,
      foreignSubscriptions: 0,
      foreignInbox: 0,
      foreignPreferences: 0,
    });
    record(cases, "notification-table-RLS", actor, {
      reason: "self-only-row-visibility",
      ...value,
    });
  }
}

function pruneFlow(db, cases) {
  const entries = [
    [9950, 1, 9931, false],
    [9951, 1, 9931, true],
    [9952, 2, 9932, false],
  ];
  const setup = entries
    .map(
      ([request, member, device, live]) => `insert into public.device_push_test_requests
    (id,household_id,member_id,subscription_id,endpoint_hash,created_at)
    values('${id(request)}','${id(10)}','${id(member)}','${id(device)}',extensions.digest('Synthetic old ${request}','sha256'),now()-interval '3 days');
    insert into public.push_outbox(id,household_id,recipient_member_id,test_subscription_id,created_at,claim_token,claimed_at,claim_expires_at)
    values('${id(request)}','${id(10)}','${id(member)}','${id(device)}',now()-interval '3 days',
      ${live ? quote(id(9953)) : "null"},${live ? "now()" : "null"},${live ? "now()+interval '1 hour'" : "null"});`,
    )
    .join("\n");
  const value = flow(db, 1, {
    setup,
    commands: [notificationEnqueue()],
    observation: `jsonb_build_object(
    'expiredOwnRemoved',not exists(select 1 from public.push_outbox where id='${id(9950)}'),
    'liveOwnPreserved',exists(select 1 from public.push_outbox where id='${id(9951)}' and claim_token='${id(9953)}'),
    'oldPartnerPreserved',exists(select 1 from public.push_outbox where id='${id(9952)}'),
    'ownOldQuotaRemoved',(select count(*) from public.device_push_test_requests where member_id='${id(1)}' and created_at<now()-interval '2 days')=0)`,
  });
  assert.deepEqual(value.results[0], { id: id(9948), status: "queued" });
  assert.deepEqual(value.observed.state, {
    expiredOwnRemoved: true,
    liveOwnPreserved: true,
    oldPartnerPreserved: true,
    ownOldQuotaRemoved: true,
  });
  record(cases, "enqueue_self_device_push_test", 1, {
    reason: "bounded-owner-cleanup-preserves-live-claims-and-partner",
    ...value,
  });
}
