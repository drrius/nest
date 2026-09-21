import * as Schema from "effect/Schema";
import { MealWeekStart } from "@nest/contracts/meals";
import { AddMealIngredients, MealIngredientsReceipt } from "@nest/contracts/meal-ingredients";
import {
  IngredientDraft,
  IngredientAttempt,
  matchesDraft,
  matchesIngredientReceipt,
} from "../meals/ingredient-draft.ts";
import { fail, type Session } from "./contracts.ts";
import { scoped } from "./session.ts";
import type { Database, Transaction } from "./database.ts";
const codec = Schema.fromJsonString(IngredientAttempt);
const keys = (session: Session, week: string) => [session.actor, session.household, week];
async function read(tx: Transaction, session: Session, week: string) {
  if (!Schema.is(MealWeekStart)(week)) fail("invalid_input");
  const rows = await tx.all<{ data: string }>(
    "SELECT data FROM meal_ingredient_attempts WHERE actor=? AND household=? AND week_start=?",
    keys(session, week),
  );
  if (!rows[0]) return null;
  const attempt = Schema.decodeUnknownSync(codec)(rows[0].data, { onExcessProperty: "error" });
  if (attempt.weekStart !== week) fail("invalid_input");
  return attempt;
}
async function save(tx: Transaction, session: Session, value: IngredientAttempt) {
  const attempt = Schema.decodeUnknownSync(IngredientAttempt)(value, { onExcessProperty: "error" });
  await tx.run(
    "INSERT OR REPLACE INTO meal_ingredient_attempts(actor,household,week_start,data) VALUES(?,?,?,?)",
    [...keys(session, attempt.weekStart), Schema.encodeSync(codec)(attempt)],
  );
  return attempt;
}
// Review metadata and exact online requests only. Never scheduled by offline replay.
export const readIngredientAttempt = (db: Database, session: Session, week: string) =>
  scoped(db, session, (tx) => read(tx, session, week));
export function saveIngredientDraft(
  db: Database,
  session: Session,
  input: { draft: IngredientDraft; expectedSequence: number | null },
) {
  const draft = Schema.decodeUnknownSync(IngredientDraft)(input.draft, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const prior = await read(tx, session, draft.weekStart);
    if (prior?.pending) fail("pending_edit");
    if ((prior?.sequence ?? null) !== input.expectedSequence) fail("operation_reused");
    return save(tx, session, {
      ...draft,
      sequence: (prior?.sequence ?? 0) + 1,
      pending: null,
      receipt: prior?.receipt ?? null,
    });
  });
}
export function stageIngredientAddition(
  db: Database,
  session: Session,
  input: { command: AddMealIngredients; expectedSequence: number },
) {
  const command = Schema.decodeUnknownSync(AddMealIngredients)(input.command, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const prior = await read(tx, session, command.weekStart);
    if (!prior || prior.sequence !== input.expectedSequence) fail("operation_reused");
    if (prior.pending) fail("pending_edit");
    if (!matchesDraft(prior, command)) fail("invalid_input");
    return save(tx, session, { ...prior, sequence: prior.sequence + 1, pending: command });
  });
}
export function recordIngredientAddition(
  db: Database,
  session: Session,
  input: MealIngredientsReceipt,
) {
  const receipt = Schema.decodeUnknownSync(MealIngredientsReceipt)(input, {
    onExcessProperty: "error",
  });
  if (receipt.actorId !== session.actor || receipt.householdId !== session.household)
    fail("invalid_receipt");
  return scoped(db, session, async (tx) => {
    const prior = await read(tx, session, receipt.weekStart);
    if (!prior?.pending || !matchesIngredientReceipt(receipt, prior.pending))
      fail("invalid_receipt");
    return save(tx, session, {
      ...prior,
      sequence: prior.sequence + 1,
      pending: null,
      receipt,
      choices: prior.choices.map((row) => ({ ...row, selected: false })),
    });
  });
}
export function clearIngredientAddition(
  db: Database,
  session: Session,
  target: { weekStart: string; operationId: string },
) {
  return scoped(db, session, async (tx) => {
    const prior = await read(tx, session, target.weekStart);
    if (!prior?.pending || prior.pending.operationId !== target.operationId)
      fail("operation_reused");
    return save(tx, session, { ...prior, sequence: prior.sequence + 1, pending: null });
  });
}
