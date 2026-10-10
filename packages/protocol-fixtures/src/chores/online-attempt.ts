import type * as Effect from "effect/Effect";
import type { ChoreFailure } from "./client.ts";
import type { SkipChore, RescheduleChore } from "@nest/contracts/routines";
import type { RequestChoreTransfer, RespondChoreTransfer } from "@nest/contracts/chore-transfers";
import type { ChoreFlow } from "./flow.ts";
export type ChoreAttempt =
  | typeof SkipChore.Type
  | typeof RescheduleChore.Type
  | typeof RequestChoreTransfer.Type
  | typeof RespondChoreTransfer.Type;
export function executeAttempt(
  flow: ChoreFlow,
  attempt: ChoreAttempt,
): Effect.Effect<{ readonly action: keyof typeof changeMessages }, ChoreFailure> {
  if ("requestId" in attempt) return flow.respondTransfer(attempt);
  if ("recipientId" in attempt) return flow.requestTransfer(attempt);
  return "newDueDate" in attempt ? flow.reschedule(attempt) : flow.skip(attempt);
}
export const changeMessages = {
  skip: "Chore skipped.",
  reschedule: "Chore rescheduled.",
  request: "Request sent. Responsibility changes only if your partner accepts.",
  accept: "Handover accepted for this turn.",
  decline: "Handover declined. Responsibility stays unchanged.",
};
