import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of [
  "tests/database/ai-command-fixture.sql",
  "supabase/migrations/20260919205503_native_chore_receipts.sql",
  "supabase/migrations/20260919214311_native_grocery_check_receipts.sql",
  "supabase/migrations/20260920002735_native_grocery_commands.sql",
  "supabase/migrations/20260919220034_native_private_conversations.sql",
  "supabase/migrations/20260920022841_native_ai_turn_ownership.sql",
])
  db.file(file);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql) => `set role authenticated; set request.jwt.claim.sub='${id(1)}'; ${sql}`;
const input = JSON.stringify({ name: "Apple", quantity: null, unit: null, categoryId: null });

test("migration rejects unrecoverable writes on already-running full claims without losing history", () => {
  for (const [n, transcript] of [
    [
      1000,
      "(select jsonb_agg(jsonb_build_object('id',n,'role','assistant','parts','[]'::jsonb)) from generate_series(1,999) n)",
    ],
    [
      2000,
      "jsonb_build_array(jsonb_build_object('id','large','role','assistant','parts',jsonb_build_array(jsonb_build_object('type','text','text',repeat('x',2000000)))))",
    ],
  ]) {
    db.sql(
      `insert into public.nest_ai_conversations(id,actor_id,household_id,transcript) values('${id(n)}','${id(1)}','${id(10)}',${transcript})`,
    );
    const message = JSON.stringify({
      id: id(n + 1),
      role: "user",
      parts: [{ type: "text", text: "Add apple" }],
    });
    db.sql(
      as(
        `select public.nest_begin_ai_turn('${id(10)}','${id(n)}','${id(n + 1)}',0,'${message}'::jsonb)`,
      ),
    );
  }
  db.file("supabase/migrations/20260920033321_native_ai_command_journal.sql");
  const before = db.sql("select count(*) from public.grocery_items");
  for (const n of [1000, 2000]) {
    const history = db.sql(
      `select md5(transcript::text) from public.nest_ai_conversations where id='${id(n)}'`,
    );
    assert.throws(
      () =>
        db.sql(
          as(
            `select public.nest_execute_ai_command('${id(10)}','${id(n)}','${id(n + 1)}','call','addGrocery','${input}'::jsonb)`,
          ),
        ),
      /capacity reached/,
    );
    db.sql(
      as(
        `select public.nest_finish_ai_turn('${id(10)}','${id(n)}','${id(n + 1)}','interrupted',null)`,
      ),
    );
    assert.equal(
      db.sql(`select md5(transcript::text) from public.nest_ai_conversations where id='${id(n)}'`),
      history,
    );
    assert.equal(
      db.sql(`select state from public.nest_ai_turns where conversation_id='${id(n)}'`),
      "interrupted",
    );
  }
  assert.equal(db.sql("select count(*) from public.grocery_items"), before);
  assert.equal(db.sql("select count(*) from public.nest_ai_commands"), "0");
});
