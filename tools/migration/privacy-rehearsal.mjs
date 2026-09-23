import assert from "node:assert/strict";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function seedPrivacyRehearsal(db) {
  db.sql(`insert into public.notification_digest_preferences(household_id,member_id,enabled,local_time)
    values('${id(10)}','${id(1)}',true,'07:30'),('${id(10)}','${id(2)}',false,'09:15')
    on conflict(household_id,member_id) do update set enabled=excluded.enabled,local_time=excluded.local_time;`);
}
export function capturePrivacyHistory(db) {
  return db.sql(`select jsonb_agg(to_jsonb(p) order by household_id,member_id)
    from public.notification_digest_preferences p`);
}
export function verifyPrivacyRehearsal(db, before) {
  assert.equal(capturePrivacyHistory(db), before, "Legacy notification preferences changed");
  for (const table of [
    "public.nest_notification_preferences",
    "public.nest_calendar_consent",
    "public.nest_memories",
    "private.nest_push_devices",
  ])
    assert.equal(
      db.sql(`select count(*) from ${table}`),
      "0",
      "Migration created an unrequested native opt-in",
    );
  return {
    passed: true,
    retainedDigestPreferences: 2,
    nativeNotificationSettings: 0,
    calendarConsents: 0,
    memories: 0,
    pushDevices: 0,
  };
}
