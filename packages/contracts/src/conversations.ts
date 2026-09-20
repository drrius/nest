import * as Schema from "effect/Schema";
const Uuid = Schema.String.check(Schema.isUUID());
export const ConversationRevision = Schema.String.check(
  Schema.isPattern(/^(0|[1-9][0-9]{0,18})$/),
  Schema.makeFilter((value: string) => BigInt(value) <= 9223372036854775807n),
);
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
