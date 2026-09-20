import { startFixturePostgres } from "./fixture-postgres.mjs";
import { aiMealPlacementFiles } from "./ai-meal-placement-files.mjs";
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
export const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
export const input = (weekStart = "2026-10-05") => ({
  weekStart,
  expectedRevision: "0",
  date: weekStart,
  slot: "lunch",
  title: "Requested pasta",
});
export function placementJournalFixture() {
  const db = startFixturePostgres();
  for (const file of aiMealPlacementFiles) db.file(file);
  let sequence = 1000;
  const start = (actor = id(1)) => {
    const conversation = id(sequence++),
      turn = id(sequence++);
    const message = {
      id: turn,
      role: "user",
      parts: [{ type: "text", text: "Add pasta for Monday lunch" }],
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
  const command = (turn, value, call = "placement") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','placeMeal',${json(value)})`;
  const execute = (turn, value, call) =>
    JSON.parse(db.sql(as(command(turn, value, call), turn.actor)));
  return { db, start, command, execute };
}
