import * as Schema from "effect/Schema";
import { Revision } from "./revision.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export const ConversationTimestamp = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/),
  Schema.makeFilter((value: string) => Number.isFinite(Date.parse(value))),
);
export const ConversationRevision = Revision;
export const TurnIdentity = Schema.Struct({ conversationId: Uuid, operationId: Uuid });
export const StartTurn = Schema.Struct({
  ...TurnIdentity.fields,
  expectedRevision: ConversationRevision,
  text: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(2000),
    Schema.makeFilter((value: string) => value.trim().length > 0),
  ),
});
export const TurnReceipt = Schema.Struct({
  claimed: Schema.Boolean,
  state: Schema.Literals(["running", "completed", "interrupted"]),
  assistantId: Uuid,
  inputRevision: ConversationRevision,
  finalRevision: Schema.NullOr(ConversationRevision),
  deadline: Schema.String.check(
    Schema.makeFilter((value: string) => Number.isFinite(Date.parse(value))),
  ),
}).check(
  Schema.makeFilter((value) => {
    if (BigInt(value.inputRevision) === 0n) return false;
    if (value.state === "running") return value.finalRevision === null;
    return (
      !value.claimed &&
      value.finalRevision !== null &&
      BigInt(value.finalRevision) > BigInt(value.inputRevision)
    );
  }),
);
export type StartTurn = typeof StartTurn.Type;
export const ConversationSummary = Schema.Struct({
  conversationId: Uuid,
  revision: ConversationRevision,
  createdAt: ConversationTimestamp,
  updatedAt: ConversationTimestamp,
});
export const ConversationPage = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  conversations: Schema.Array(ConversationSummary).check(Schema.isMaxLength(20)),
  nextCursor: Schema.NullOr(Uuid),
});
