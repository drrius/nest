import assert from "node:assert/strict";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function verifyLinkedRenewal(db) {
  // Roll back the explicit adoption so preservation assertions retain their original baseline.
  const result = JSON.parse(
    db.sql(`begin;
    update public.household_commitments set recurring_expense_rule_id='${id(901)}' where id='${id(1102)}';
    set local role authenticated; set local request.jwt.claim.sub='${id(1)}';
    do $adopt$ declare v_today text:=to_char((clock_timestamp() at time zone 'Europe/Zurich')::date,'YYYY-MM-DD'); v_review jsonb;
    begin
      v_review:=public.nest_read_legacy_adoption_context('${id(10)}','${id(901)}');
      perform public.nest_save_legacy_adoption('${id(10)}','${id(1195)}',jsonb_build_object(
        'ruleId','${id(901)}','reviewToken',v_review->>'reviewToken','firstDueOn',v_today,
        'configuration',jsonb_build_object('description','Synthetic explicit adoption','mode','fixed',
          'amountCentimes','101','allocations',jsonb_build_array(
            jsonb_build_object('memberId','${id(1)}','centimes','51'),jsonb_build_object('memberId','${id(2)}','centimes','50')),
          'payerId','${id(1)}','categoryId',null,'note',null,'startDate',v_today,
          'schedule',jsonb_build_object('kind','monthly','dayOfMonth',right(v_today,2)::integer))));
    end $adopt$;
    select public.nest_convert_legacy_renewal('${id(10)}','${id(1102)}','${id(1196)}',
      (select encode(sha256(convert_to(to_jsonb(c)::text,'UTF8')),'hex') from public.household_commitments c where id='${id(1102)}'));
    rollback;`),
  );
  assert.equal(result.renewal.fields.recurringRuleId, id(901));
  assert.equal(result.renewal.renewalId, id(1102));
  assert.equal(db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "0");
}
