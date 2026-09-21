import { id } from "../database/money-expense-helpers.mjs";
import { firstRecurringDate } from "../../packages/domain/src/money/recurrence.ts";
export { id };
export const input = (start = "2026-10-01") => ({
  ruleId: id(100),
  expectedRevision: null,
  configuration: {
    description: "Synthetic fixed mandate",
    mode: "fixed",
    amountCentimes: "101",
    allocations: [
      { memberId: id(1), centimes: "51" },
      { memberId: id(2), centimes: "50" },
    ],
    payerId: id(1),
    categoryId: null,
    note: null,
    startDate: start,
    schedule: { kind: "monthly", dayOfMonth: 31 },
  },
  firstDueOn: firstRecurringDate({ kind: "monthly", dayOfMonth: 31 }, start),
});
export const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(200),
  approvalId: null,
  revision: id(300),
  status: "active",
  rule: input(),
};
export const row = {
  ruleId: id(100),
  revision: id(300),
  configuration: input().configuration,
  status: "active",
  authorizedBy: id(1),
  authorizedAt: "2026-09-21T12:00:00.000000Z",
  coveredThrough: null,
  nextDueOn: "2026-10-31",
};
export const list = {
  version: 1,
  householdId: id(10),
  today: "2026-09-21",
  after: null,
  next: null,
  rules: [row],
};
export const detail = { version: 1, householdId: id(10), today: "2026-09-21", rule: row };
