import * as Schema from "effect/Schema";
import { RenewalFields, type Renewal } from "@nest/contracts/renewals";
export interface RenewalDraft {
  title: string;
  renewalOn: string;
  noticeDays: string;
  responsibleId: string | null;
  recurringRuleId: string | null;
}
export function renewalDraft(renewal: typeof Renewal.Type | null, today: string): RenewalDraft {
  if (!renewal)
    return {
      title: "",
      renewalOn: today,
      noticeDays: "0",
      responsibleId: null,
      recurringRuleId: null,
    };
  return { ...renewal.fields, noticeDays: String(renewal.fields.noticeDays) };
}
export function parseRenewalDraft(draft: RenewalDraft): RenewalFields | null {
  if (!/^(0|[1-9]\d{0,2})$/.test(draft.noticeDays)) return null;
  const fields = {
    title: draft.title.trim(),
    renewalOn: draft.renewalOn,
    noticeDays: Number(draft.noticeDays),
    responsibleId: draft.responsibleId?.toLowerCase() ?? null,
    recurringRuleId: draft.recurringRuleId?.toLowerCase() ?? null,
  };
  return Schema.is(RenewalFields)(fields) ? fields : null;
}
