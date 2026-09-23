import { readFileSync } from "node:fs";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { choreTransferFiles } from "./chore-transfer-files.mjs";
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
export const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
export const migration = "supabase/migrations/20260923033231_native_chore_reminder_storage.sql";
export function fixture(t) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  for (const file of choreTransferFiles) db.file(file);
  // Exact existing shared validators, excluding unrelated Money/renewal storage.
  for (const [file, end] of [
    ["20260921120810_native_ai_expense_proposal", "create function private.nest_canonical_expense"],
    [
      "20260922213246_native_renewal_reminder_storage",
      "create table public.nest_renewal_reminders",
    ],
  ]) {
    const source = readFileSync(`supabase/migrations/${file}.sql`, "utf8");
    db.sql(source.slice(0, source.indexOf(end)));
  }
  db.file(migration);
  const routine = JSON.parse(
    db.sql(
      as(
        `select public.nest_create_routine('${id(10)}','${id(1000)}',${json({ title: "Synthetic chore", schedule: { kind: "daily" }, assignment: { policy: "assigned", memberId: id(1) } })})`,
      ),
    ),
  );
  const occurrenceId = db.sql(
    `select id from public.routine_occurrences where routine_id='${routine.routineId}' and role='current'`,
  );
  const read = (actor = id(1)) =>
    JSON.parse(
      db.sql(as(`select public.nest_read_chore_reminder('${id(10)}','${occurrenceId}')`, actor)),
    );
  const settings = {
    enabled: true,
    recipientIds: [id(1), id(2)],
    localTime: "09:00",
    daysBefore: 0,
  };
  const input = {
    occurrenceId,
    expectedItemRevision: read().itemRevision,
    expectedRevision: null,
    settings,
  };
  const saveSql = (value = input, operation = id(2000)) =>
    `select public.nest_save_chore_reminder('${id(10)}','${operation}',${json(value)})`;
  const save = (value = input, operation = id(2000), actor = id(1)) =>
    JSON.parse(db.sql(as(saveSql(value, operation), actor)));
  const recover = (operation = id(2000), cancel = false, actor = id(1)) =>
    JSON.parse(
      db.sql(
        as(
          `select public.nest_${cancel ? "cancel" : "read"}_chore_reminder_operation('${id(10)}','${operation}')`,
          actor,
        ),
      ),
    );
  return { db, routine, occurrenceId, read, settings, input, saveSql, save, recover };
}
