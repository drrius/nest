import { startFixturePostgres } from "./fixture-postgres.mjs";
import { aiMealReplacementFiles } from "./ai-meal-replacement-files.mjs";
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
export const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
export function replacementJournalFixture(t) {
  const db = startFixturePostgres();
  t?.after(() => db.stop());
  for (const file of aiMealReplacementFiles) db.file(file);
  let sequence = 1000;
  const start = (actor = id(1)) => {
    const conversation = id(sequence++),
      turn = id(sequence++);
    const message = {
      id: turn,
      role: "user",
      parts: [{ type: "text", text: "Replace the requested meal with soup" }],
    };
    const claim = JSON.parse(
      db.sql(
        as(
          `select public.nest_begin_ai_turn('${id(10)}','${conversation}','${turn}',0,${json(message)})`,
          actor,
        ),
      ),
    );
    return { actor, conversation, turn, claim };
  };
  const command = (turn, value, call = "replacement") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','replaceMeal',${json(value)})`;
  const execute = (turn, value, call) =>
    JSON.parse(db.sql(as(command(turn, value, call), turn.actor)));
  const add = (n, weekStart = "2026-10-05") => {
    db.sql(
      `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values ('${id(n)}','${id(10)}','${weekStart}','lunch','Requested meal')`,
    );
    return {
      entryId: id(n),
      weekStart,
      date: weekStart,
      slot: "lunch",
      title: "New soup",
      expectedRevision: db.sql(
        `select revision from public.nest_meal_week_revisions where household_id='${id(10)}' and week_start='${weekStart}'`,
      ),
    };
  };
  return { db, start, command, execute, add };
}
