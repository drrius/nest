import { startFixturePostgres } from "./fixture-postgres.mjs";
import { aiRecipeCreationFiles } from "./ai-recipe-creation-files.mjs";
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
export const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
export function recipeJournalFixture(t) {
  const db = startFixturePostgres();
  t?.after(() => db.stop());
  for (const file of aiRecipeCreationFiles) db.file(file);
  let sequence = 1000;
  const start = (actor = id(1)) => {
    const conversation = id(sequence++),
      turn = id(sequence++);
    const message = {
      id: turn,
      role: "user",
      parts: [{ type: "text", text: "Save this recipe in the library" }],
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
  const command = (turn, value, call = "recipe") =>
    `select public.nest_execute_ai_command('${id(10)}','${turn.conversation}','${turn.turn}','${call}','createRecipe',${json(value)})`;
  const execute = (turn, value, call) =>
    JSON.parse(db.sql(as(command(turn, value, call), turn.actor)));
  return { db, start, command, execute };
}

export function boundedRecipeInput(bytes = 49152) {
  const value = {
    expectedRevision: "0",
    recipe: {
      title: "Soup",
      servings: 2,
      instructions: "Simmer",
      recipeUrl: null,
      notes: "",
      ingredients: Array.from({ length: 42 }, () => ({
        name: "Tomato",
        quantity: "1/2",
        unit: "cup",
        categoryId: null,
        note: "x".repeat(1000),
      })),
    },
  };
  const remaining = bytes - new TextEncoder().encode(JSON.stringify(value)).length;
  if (remaining < 0 || remaining > 8000) throw new Error("Boundary fixture invalid");
  value.recipe.notes = "é".repeat(Math.floor(remaining / 2)) + (remaining % 2 ? "x" : "");
  return value;
}
