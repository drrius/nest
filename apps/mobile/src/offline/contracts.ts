import * as Schema from "effect/Schema";

export const Account = Schema.Struct({
  actor: Schema.String.check(Schema.isUUID()),
  household: Schema.String.check(Schema.isUUID()),
});
export const Intent = Schema.Union([
  Schema.Struct({
    operation: Schema.String.check(Schema.isUUID()),
    kind: Schema.Literal("chore.complete"),
    target: Schema.String.check(Schema.isUUID()),
    expected: Schema.NonEmptyString,
    completedOn: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
  }),
  Schema.Struct({
    operation: Schema.String.check(Schema.isUUID()),
    kind: Schema.Literal("groceries.setChecked"),
    target: Schema.String.check(Schema.isUUID()),
    expected: Schema.NonEmptyString,
    checked: Schema.Boolean,
  }),
]);
export type Account = typeof Account.Type;
export type Intent = typeof Intent.Type;
export type Session = Account & { readonly lease: string };
export type Kind = Intent["kind"];
export interface Operation {
  sequence: number;
  operation: string;
  kind: Kind;
  target: string;
  intent: string;
  expected: string;
  predecessor: string | null;
  wire: string | null;
  status: "pending" | "conflict" | "acknowledged";
  result_version: string | null;
  reason: string | null;
}
export const Item = Schema.Struct({
  kind: Schema.Literals(["chore.complete", "groceries.setChecked"]),
  target: Schema.String.check(Schema.isUUID()),
  version: Schema.NonEmptyString,
  value: Schema.Literals([0, 1]),
});
export type Item = typeof Item.Type;
export class OfflineFailure extends Schema.TaggedError<OfflineFailure>()("OfflineFailure", {
  reason: Schema.Literals([
    "session_changed",
    "invalid_input",
    "operation_reused",
    "missing_snapshot",
    "storage",
    "invalid_receipt",
  ]),
}) {}
export function fail(reason: OfflineFailure["reason"]): never {
  throw new OfflineFailure({ reason });
}
export function decodeIntent(input: unknown): Intent {
  try {
    return Schema.decodeUnknownSync(Intent)(input);
  } catch {
    return fail("invalid_input");
  }
}
