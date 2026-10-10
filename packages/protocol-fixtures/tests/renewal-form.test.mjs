import test from "node:test";
import assert from "node:assert/strict";
import { renewalDraft, parseRenewalDraft } from "../src/renewals/form.ts";
test("renewal form rejects ambiguous lead times and invalid dates without coercion", () => {
  const draft = { ...renewalDraft(null, "2028-03-01"), title: " Internet ", noticeDays: "1" };
  assert.equal(parseRenewalDraft(draft).title, "Internet");
  for (const noticeDays of ["", "01", "-1", "1.5", "1e2", " 1", "731", "Infinity"]) {
    assert.equal(parseRenewalDraft({ ...draft, noticeDays }), null);
  }
  assert.equal(parseRenewalDraft({ ...draft, renewalOn: "2027-02-29" }), null);
  assert.equal(parseRenewalDraft({ ...draft, renewalOn: "0001-01-01" }), null);
  assert.equal(
    parseRenewalDraft({ ...draft, noticeDays: "0", renewalOn: "0001-01-01" }).noticeDays,
    0,
  );
});
test("renewal editor retains the reviewed fields and validates Unicode titles", () => {
  const fields = {
    title: "🪴".repeat(160),
    renewalOn: "2028-03-01",
    noticeDays: 730,
    responsibleId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
    recurringRuleId: null,
  };
  const draft = renewalDraft({ fields }, "2030-01-01");
  assert.equal(draft.renewalOn, fields.renewalOn);
  const parsed = parseRenewalDraft(draft);
  assert.equal(parsed.title, fields.title);
  assert.equal(parsed.responsibleId, fields.responsibleId.toLowerCase());
  assert.equal(parseRenewalDraft({ ...draft, title: fields.title + "🪴" }), null);
  assert.equal(parseRenewalDraft({ ...draft, responsibleId: "unknown" }), null);
});
test("renewal confirmation captures its command, rejects stale dialogs and runs only once", async () => {
  const { renewalConfirmation } = await import("../src/renewals/confirmation.ts");
  const command = {
    operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    renewalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    expectedRevision: null,
    fields: parseRenewalDraft({
      ...renewalDraft(null, "2028-03-01"),
      title: "Internet",
      noticeDays: "1",
    }),
  };
  let current = true;
  const sent = [];
  const dialog = renewalConfirmation(
    command,
    () => current,
    async (value) => {
      sent.push(value);
    },
    { responsible: "Unassigned", linked: "None" },
  );
  command.fields.title = "Changed after review";
  assert.match(dialog.message, /Internet/);
  assert.match(dialog.message, /2028-02-29/);
  current = false;
  assert.equal(await dialog.confirm(), false);
  assert.equal(sent.length, 0);
  current = true;
  assert.equal(await dialog.confirm(), true);
  assert.equal(await dialog.confirm(), false);
  assert.equal(sent[0].fields.title, "Internet");
  assert.equal(sent.length, 1);
});
test("renewal review distinguishes assignment and linked expense changes", async () => {
  const { renewalReview } = await import("../src/renewals/confirmation.ts");
  const fields = parseRenewalDraft({ ...renewalDraft(null, "2028-03-01"), title: "Internet" });
  const plain = renewalReview(fields, { responsible: "Unassigned", linked: "None" });
  const assigned = renewalReview(
    { ...fields, responsibleId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    { responsible: "Alex", linked: "None" },
  );
  const linked = renewalReview(
    { ...fields, recurringRuleId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    { responsible: "Unassigned", linked: "Internet subscription" },
  );
  assert.notEqual(plain, assigned);
  assert.notEqual(plain, linked);
  assert.match(assigned, /Responsible: Alex/);
  assert.match(linked, /Linked expense: Internet subscription/);
});
