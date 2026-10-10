import { account } from "./offline-fixture.mjs";
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const balance = {
  version: 1,
  kind: "balance",
  savedAt: "2026-09-21T12:00:00.000Z",
  value: {
    version: 1,
    householdId: account.household,
    eventCount: "1",
    openingEstablished: true,
    members: [
      { actorId: account.actor, displayName: "A", centimes: "9007199254740991" },
      { actorId: id(2), displayName: "B", centimes: "-9007199254740991" },
    ],
  },
};
export const history = {
  version: 1,
  kind: "history",
  savedAt: balance.savedAt,
  value: { version: 1, householdId: account.household, before: null, next: null, events: [] },
};
export const detail = {
  version: 1,
  kind: "detail",
  savedAt: balance.savedAt,
  value: {
    version: 1,
    householdId: account.household,
    event: {
      eventId: id(100),
      kind: "opening_balance",
      occurredOn: "infinity",
      createdAt: "infinity",
      occurredOrder: "infinity",
      createdOrder: "infinity",
      description: "Retained",
      amountCentimes: "9007199254740991",
      createdBy: account.actor,
      payerId: account.actor,
      relatedEventId: null,
      hasReceipt: true,
    },
    note: "Household note",
    category: null,
    reversedById: null,
    shares: balance.value.members.map((member) => ({
      memberId: member.actorId,
      allocatedCentimes: null,
      deltaCentimes: member.centimes,
    })),
  },
};
