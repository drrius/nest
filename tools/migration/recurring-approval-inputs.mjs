import { as, id, payload } from "../../tests/database/native-expense-helpers.mjs";
export const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const allocations = [
  { memberId: id(4), centimes: "51" },
  { memberId: id(5), centimes: "50" },
];
const record = (db, kind, operation, input) =>
  JSON.parse(
    db.sql(as(4, `select public.nest_save_${kind}('${id(11)}','${id(operation)}',${json(input)})`)),
  );

export function recurringApprovalInput(db, { action, base, today }) {
  const input = {
    ruleId: id(base),
    expectedRevision: null,
    configuration: {
      description: "Synthetic recurring approval recovery",
      mode: "variable",
      amountCentimes: null,
      allocations: null,
      payerId: id(4),
      categoryId: null,
      note: null,
      startDate: today,
      schedule: { kind: "monthly", dayOfMonth: Number(today.slice(8)) },
    },
    firstDueOn: today,
  };
  if (action === "create") return input;
  const created = record(db, "recurring", base + 1, input);
  const version = { ruleId: input.ruleId, expectedRevision: created.revision };
  if (action === "update")
    return {
      ...input,
      ...version,
      configuration: { ...input.configuration, description: "Reviewed update" },
    };
  if (action === "pause" || action === "cancel")
    return { ...version, expectedStatus: "active", action };
  if (action === "resume") {
    const paused = record(db, "recurring_state", base + 3, {
      ...version,
      expectedStatus: "active",
      action: "pause",
    });
    return {
      ...version,
      expectedRevision: paused.revision,
      expectedStatus: "paused",
      action,
      resumeFrom: today,
      firstDueOn: today,
    };
  }
  if (action === "link-cycle") {
    const source = record(
      db,
      "expense",
      base + 3,
      payload({ payerId: id(4), allocations, date: today }),
    );
    return { ...version, dueOn: today, sourceEventId: source.eventId };
  }
  if (action !== "record-cycle") throw new Error("Unknown recurring recovery action");
  return { ...version, dueOn: today, amountCentimes: "101", allocations };
}
