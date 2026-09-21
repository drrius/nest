import * as Schema from "effect/Schema";
import { MealWeekStart } from "@nest/contracts/meals";
import {
  GenerateMealProposal,
  MealProposalGenerationReceipt,
  DiscardMealProposal,
  ApproveMealProposal,
} from "@nest/contracts/meal-proposals";
import { MealProposalAttempt } from "../meals/proposal-attempt.ts";
import { scoped } from "./session.ts";
import { fail, type Session } from "./contracts.ts";
import type { Database, Transaction } from "./database.ts";
const codec = Schema.fromJsonString(MealProposalAttempt);
const keys = (session: Session, week: string) => [session.actor, session.household, week];
async function read(tx: Transaction, session: Session, week: string) {
  if (!Schema.is(MealWeekStart)(week)) fail("invalid_input");
  const rows = await tx.all<{ data: string }>(
    "SELECT data FROM meal_proposal_attempts WHERE actor=? AND household=? AND week_start=?",
    keys(session, week),
  );
  if (!rows[0]) return null;
  const attempt = Schema.decodeUnknownSync(codec)(rows[0].data, { onExcessProperty: "error" });
  if (attempt.generation.weekStart !== week) fail("invalid_input");
  return attempt;
}
async function save(tx: Transaction, session: Session, attempt: MealProposalAttempt) {
  await tx.run(
    "INSERT OR REPLACE INTO meal_proposal_attempts(actor,household,week_start,data) VALUES(?,?,?,?)",
    [...keys(session, attempt.generation.weekStart), Schema.encodeSync(codec)(attempt)],
  );
  return attempt;
}
// Only request metadata is persisted. No recipes, profiles, secret, offline queue or automatic replay.
export const readMealProposalAttempt = (db: Database, session: Session, week: string) =>
  scoped(db, session, (tx) => read(tx, session, week));
export function stageMealProposal(db: Database, session: Session, input: GenerateMealProposal) {
  const command = Schema.decodeUnknownSync(GenerateMealProposal)(input, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session, command.weekStart);
    if (pending) {
      if (!Schema.toEquivalence(GenerateMealProposal)(pending.generation, command))
        fail("pending_edit");
      return pending;
    }
    return save(tx, session, { generation: command, proposalId: null, discard: null });
  });
}
export function recordMealProposal(
  db: Database,
  session: Session,
  receipt: typeof MealProposalGenerationReceipt.Type,
) {
  if (
    !Schema.is(MealProposalGenerationReceipt)(receipt) ||
    receipt.actorId !== session.actor ||
    receipt.householdId !== session.household
  )
    fail("invalid_receipt");
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session, receipt.weekStart);
    if (!pending || !matchesStart(pending, receipt)) fail("invalid_receipt");
    return save(tx, session, { ...pending, proposalId: receipt.proposalId });
  });
}
function matchesStart(
  pending: MealProposalAttempt,
  receipt: typeof MealProposalGenerationReceipt.Type,
) {
  return (
    pending.generation.operationId === receipt.operationId &&
    pending.generation.expectedWeekRevision === receipt.expectedWeekRevision &&
    pending.generation.familiarOnly === receipt.familiarOnly &&
    (pending.proposalId === null || pending.proposalId === receipt.proposalId)
  );
}
export function stageProposalDiscard(
  db: Database,
  session: Session,
  target: { weekStart: string; command: typeof DiscardMealProposal.Type },
) {
  const command = Schema.decodeUnknownSync(DiscardMealProposal)(target.command, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session, target.weekStart);
    if (!pending || pending.proposalId !== command.proposalId) fail("invalid_input");
    if (pending.approval) fail("pending_edit");
    if (pending.discard && !Schema.toEquivalence(DiscardMealProposal)(pending.discard, command))
      fail("pending_edit");
    return save(tx, session, { ...pending, discard: command });
  });
}
export function clearMealProposalAttempt(
  db: Database,
  session: Session,
  target: { weekStart: string; operationId: string },
) {
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session, target.weekStart);
    if (!pending) return;
    if (pending.generation.operationId !== target.operationId) fail("operation_reused");
    await tx.run(
      "DELETE FROM meal_proposal_attempts WHERE actor=? AND household=? AND week_start=?",
      keys(session, target.weekStart),
    );
  });
}

export function clearProposalDiscard(
  db: Database,
  session: Session,
  target: { weekStart: string; operationId: string },
) {
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session, target.weekStart);
    if (!pending?.discard) return pending;
    if (pending.discard.operationId !== target.operationId) fail("operation_reused");
    return save(tx, session, { ...pending, discard: null });
  });
}

export function stageProposalApproval(
  db: Database,
  session: Session,
  target: { weekStart: string; command: typeof ApproveMealProposal.Type },
) {
  const command = Schema.decodeUnknownSync(ApproveMealProposal)(target.command, {
    onExcessProperty: "error",
  });
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session, target.weekStart);
    if (!pending || pending.proposalId !== command.proposalId) fail("invalid_input");
    if (
      pending.discard ||
      (pending.approval && !Schema.toEquivalence(ApproveMealProposal)(pending.approval, command))
    )
      fail("pending_edit");
    return save(tx, session, { ...pending, approval: command });
  });
}

export function clearProposalApproval(
  db: Database,
  session: Session,
  target: { weekStart: string; operationId: string },
) {
  return scoped(db, session, async (tx) => {
    const pending = await read(tx, session, target.weekStart);
    if (!pending?.approval) return pending;
    if (pending.approval.operationId !== target.operationId) fail("operation_reused");
    const { approval: _approval, ...rest } = pending;
    return save(tx, session, rest);
  });
}
