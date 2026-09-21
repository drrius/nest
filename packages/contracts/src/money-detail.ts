import * as Schema from "effect/Schema";
import { MoneyEventSummary } from "./money-history.ts";
import { SignedCentimes } from "./money.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Nonnegative = SignedCentimes.check(Schema.makeFilter((value) => BigInt(value) >= 0n));
export const MoneyDetailQuery = Schema.Struct({ eventId: Uuid });
const Share = Schema.Struct({
  memberId: Uuid,
  allocatedCentimes: Schema.NullOr(Nonnegative),
  deltaCentimes: SignedCentimes,
});
export const MoneyDetail = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  event: MoneyEventSummary,
  note: Schema.NullOr(Schema.String.check(Schema.isMaxLength(8000))),
  category: Schema.NullOr(
    Schema.Struct({ id: Uuid, name: Schema.NonEmptyString.check(Schema.isMaxLength(160)) }),
  ),
  reversedById: Schema.NullOr(Uuid),
  shares: Schema.Tuple([Share, Share]),
}).check(Schema.makeFilter(validDetail));
function validDetail(detail: {
  event: typeof MoneyEventSummary.Type;
  reversedById: string | null;
  shares: readonly [typeof Share.Type, typeof Share.Type];
}) {
  const { event, shares, reversedById } = detail;
  if (
    shares[0].memberId === shares[1].memberId ||
    !shares.some((share) => share.memberId === event.createdBy) ||
    BigInt(shares[0].deltaCentimes) + BigInt(shares[1].deltaCentimes) !== 0n ||
    event.relatedEventId === event.eventId ||
    reversedById === event.eventId
  )
    return false;
  return validEntries(event, shares, reversedById);
}
function validEntries(
  event: typeof MoneyEventSummary.Type,
  shares: readonly [typeof Share.Type, typeof Share.Type],
  reversedById: string | null,
) {
  if (event.kind === "reversal")
    return reversedById === null && shares.every((share) => share.allocatedCentimes === null);
  const payer = shares.find((share) => share.memberId === event.payerId);
  if (!payer) return false;
  if (event.kind === "opening_balance" || event.kind === "settlement")
    return (
      shares.every((share) => share.allocatedCentimes === null) &&
      BigInt(payer.deltaCentimes) === BigInt(event.amountCentimes)
    );
  if (shares.some((share) => share.allocatedCentimes === null)) return false;
  if (
    shares.reduce((sum, share) => sum + BigInt(share.allocatedCentimes!), 0n) !==
    BigInt(event.amountCentimes)
  )
    return false;
  const sign = event.kind === "refund" ? -1n : 1n;
  return (
    BigInt(payer.deltaCentimes) ===
    sign * (BigInt(event.amountCentimes) - BigInt(payer.allocatedCentimes!))
  );
}
