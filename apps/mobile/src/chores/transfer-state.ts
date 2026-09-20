import type { Chore } from "@nest/contracts/chores";
import type { PendingChoreTransfer } from "@nest/contracts/chore-transfers";
import type { ChoreView } from "./runtime.ts";
export function transferRecipient(view: ChoreView, actor: string, chore: Chore) {
  const snapshot = view.data?.transfers;
  const current = view.data?.chores.find((item) => item.occurrenceId === chore.occurrenceId);
  if (current?.assigneeId !== actor || snapshot?.members.length !== 2) return null;
  return snapshot.members.find((member) => member.actorId !== actor) ?? null;
}
export function responseChore(
  view: ChoreView,
  actor: string,
  request: typeof PendingChoreTransfer.Type,
) {
  const pending = view.data?.transfers?.transfers.find(
    (row) => row.requestId === request.requestId,
  );
  const chore = view.data?.chores.find((row) => row.occurrenceId === pending?.occurrenceId);
  if (!pending || pending.toMemberId !== actor || !chore) return null;
  return chore.dueDate === pending.dueDate && chore.assigneeId === pending.fromMemberId
    ? chore
    : null;
}

export function transferReady(view: ChoreView) {
  return !view.stale && !view.syncing && view.changeStage === "ready";
}
