import * as Schema from "effect/Schema";
import { ChoreList } from "./chores.ts";
import { ChoreTransferList } from "./chore-transfers.ts";

export const ChoreSnapshot = Schema.Struct({
  ...ChoreTransferList.fields,
  chores: ChoreList.fields.chores.check(Schema.isMaxLength(200)),
}).check(Schema.makeFilter(coherentSnapshot));

function coherentSnapshot(value: {
  readonly members: typeof ChoreTransferList.Type.members;
  readonly transfers: typeof ChoreTransferList.Type.transfers;
  readonly chores: typeof ChoreList.Type.chores;
}) {
  const members = new Set(value.members.map((member) => member.actorId));
  const chores = new Map(value.chores.map((chore) => [chore.occurrenceId, chore]));
  return (
    members.size === value.members.length &&
    chores.size === value.chores.length &&
    new Set(value.transfers.map((row) => row.requestId)).size === value.transfers.length &&
    new Set(value.transfers.map((row) => row.occurrenceId)).size === value.transfers.length &&
    value.transfers.every((row) => {
      const chore = chores.get(row.occurrenceId);
      return (
        members.has(row.fromMemberId) &&
        members.has(row.toMemberId) &&
        chore?.assigneeId === row.fromMemberId &&
        chore.dueDate === row.dueDate &&
        chore.title === row.title
      );
    })
  );
}
