import * as Schema from "effect/Schema";
const Uuid = Schema.String.check(Schema.isUUID());
// Decimal strings preserve PostgreSQL numeric/bigint values without JSON number rounding.
export const SignedCentimes = Schema.String.check(
  Schema.isPattern(/^(0|-?[1-9]\d{0,15})$/),
  Schema.makeFilter((value) => {
    const amount = BigInt(value);
    return amount >= -9007199254740991n && amount <= 9007199254740991n;
  }),
);
const MemberBalance = Schema.Struct({
  actorId: Uuid,
  displayName: Schema.NonEmptyString,
  centimes: SignedCentimes,
});
export const MoneyBalance = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  eventCount: Schema.String.check(Schema.isPattern(/^(0|[1-9]\d{0,18})$/)),
  openingEstablished: Schema.Boolean,
  members: Schema.Tuple([MemberBalance, MemberBalance]),
}).check(
  Schema.makeFilter(
    (value) =>
      value.members[0].actorId !== value.members[1].actorId &&
      BigInt(value.members[0].centimes) + BigInt(value.members[1].centimes) === 0n &&
      (value.eventCount !== "0" ||
        (!value.openingEstablished && value.members.every((member) => member.centimes === "0"))),
  ),
);
