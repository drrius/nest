import * as Schema from "effect/Schema";

const Uuid = Schema.String.check(Schema.isUUID());
export const Member = Schema.Struct({
  userId: Uuid,
  householdId: Uuid,
  displayName: Schema.String,
});
export type Member = typeof Member.Type;
export const VerifiedSession = Schema.Struct({ version: Schema.Literal(1), member: Member });
export type SessionState =
  | {
      readonly status: "loading" | "signed_out" | "logout_pending" | "not_a_member" | "unavailable";
    }
  | { readonly status: "ready"; readonly member: Member; readonly offline?: true };
export class SessionFailure extends Schema.TaggedError<SessionFailure>()("SessionFailure", {
  code: Schema.Literals(["signed_out", "not_a_member", "unavailable", "cancelled"]),
}) {}
