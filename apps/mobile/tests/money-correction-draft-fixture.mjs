import { id } from "../../../tests/database/native-expense-helpers.mjs";
export { id };
export function context(amount) {
  const own = Math.floor(amount / 2),
    other = amount - own;
  return {
    version: 1,
    householdId: id(10),
    hasActiveRefunds: false,
    hasOpeningSuccessor: false,
    canReverse: true,
    canReplace: true,
    source: {
      version: 1,
      householdId: id(10),
      note: null,
      category: null,
      reversedById: null,
      event: {
        eventId: id(400),
        kind: "expense",
        occurredOn: "2026-09-21",
        createdAt: "2026-09-21T00:00:00.000000Z",
        occurredOrder: "1",
        createdOrder: "1",
        description: "Original",
        amountCentimes: String(amount),
        createdBy: id(1),
        payerId: id(1),
        relatedEventId: null,
        hasReceipt: false,
      },
      shares: [
        { memberId: id(1), allocatedCentimes: String(own), deltaCentimes: String(other) },
        { memberId: id(2), allocatedCentimes: String(other), deltaCentimes: String(-other) },
      ],
    },
  };
}
