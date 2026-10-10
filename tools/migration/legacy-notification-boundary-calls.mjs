export const notificationBoundaryId = (n) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const id = notificationBoundaryId;
export const notificationLiteral = (value) =>
  value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const quote = notificationLiteral;
export const notificationEndpoint = (device) => `https://nest-fixture.invalid/push/${device}`;

export function notificationBoundaryFixture() {
  const members = [
    [10, 1, 9931, 9941, 9945],
    [10, 2, 9932, 9942, 9946],
    [9920, 9921, 9934, 9943, 9947],
  ];
  const rows = members
    .map(
      ([household, member, device, inbox, request]) => `
    insert into public.push_subscriptions(id,household_id,member_id,endpoint,p256dh,auth)
      values('${id(device)}','${id(household)}','${id(member)}',${quote(notificationEndpoint(device))},'Synthetic key','Synthetic auth');
    insert into public.inbox_notifications(id,household_id,recipient_member_id,kind,dedupe_key)
      values('${id(inbox)}','${id(household)}','${id(member)}','routine_reminder','synthetic-notification-${inbox}');
    insert into public.device_push_test_requests(id,household_id,member_id,subscription_id,endpoint_hash,created_at)
      values('${id(request)}','${id(household)}','${id(member)}','${id(device)}',
        extensions.digest(${quote(notificationEndpoint(device))},'sha256'),now()-interval '3 minutes');
    insert into public.push_outbox(id,household_id,recipient_member_id,test_subscription_id)
      values('${id(request)}','${id(household)}','${id(member)}','${id(device)}');`,
    )
    .join("\n");
  return `insert into auth.users(id) values('${id(9921)}'),('${id(9922)}'),('${id(9923)}');
    insert into public.households(id,name) values('${id(9920)}','Foreign notification boundary');
    insert into public.household_members(household_id,user_id,display_name)
      values('${id(9920)}','${id(9921)}','Foreign first'),('${id(9920)}','${id(9922)}','Foreign second');
    insert into public.notification_digest_preferences(household_id,member_id,enabled,local_time)
      values('${id(9920)}','${id(9921)}',false,'08:00'); ${rows}
    insert into public.push_subscriptions(id,household_id,member_id,endpoint,p256dh,auth)
      values('${id(9933)}','${id(10)}','${id(1)}',${quote(notificationEndpoint(9933))},'Synthetic second key','Synthetic second auth');`;
}

export function notificationRegister({
  device = 9931,
  endpoint = notificationEndpoint(device),
  key = "Synthetic replacement",
  auth = "Synthetic auth",
} = {}) {
  return `public.register_push_subscription(${quote(endpoint)},${quote(key)},${quote(auth)},'Synthetic fixture')`;
}
export function notificationUnregister({
  device = 9931,
  endpoint = notificationEndpoint(device),
} = {}) {
  return `public.unregister_push_subscription(${quote(endpoint)})`;
}
export function notificationEnqueue({
  device = 9931,
  endpoint = notificationEndpoint(device),
  request = 9948,
} = {}) {
  return `public.enqueue_self_device_push_test(${quote(endpoint)},${request === null ? "null" : quote(id(request))})`;
}
export function notificationRead({
  device = 9931,
  endpoint = notificationEndpoint(device),
  request = 9945,
} = {}) {
  return `public.read_self_device_push_test(${quote(endpoint)},${request === null ? "null" : quote(id(request))})`;
}
export function notificationMark(ids = [9941, 9942, 9943]) {
  return `public.mark_inbox_notifications_read(array[${ids.map((n) => quote(id(n))).join(",")}]::uuid[])`;
}
export function notificationDigest({ enabled = "false", time = "'06:45'::time" } = {}) {
  return `public.upsert_digest_preference(${enabled},${time})`;
}
export const notificationPause = "public.pause_my_push_for_signout()";

export function notificationQuotaSeed(member = 1) {
  const device = member === 1 ? 9931 : 9932;
  const values = [0, 1, 2, 3].map(
    (n) => `('${id(9970 + n)}','${id(10)}','${id(member)}','${id(device)}',
    extensions.digest('Synthetic quota ${n}','sha256'),now()-interval '2 minutes')`,
  );
  return `insert into public.device_push_test_requests(id,household_id,member_id,subscription_id,endpoint_hash,created_at)
    values ${values.join(",")};`;
}
