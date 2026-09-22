import { useNativeState } from "@expo/ui";
import { useState } from "react";
import type { RenewalDraft } from "./form";
export function useRenewalFields(initial: RenewalDraft) {
  const title = useNativeState(initial.title),
    noticeDays = useNativeState(initial.noticeDays);
  const [date, setDate] = useState(() => new Date(`${initial.renewalOn}T12:00:00`));
  const [responsibleId, setResponsibleId] = useState(initial.responsibleId);
  const [linked, setLinked] = useState<{ ruleId: string; title: string } | null>(null);
  const [recurringRuleId, setRecurringRuleId] = useState(initial.recurringRuleId);
  const read = (): RenewalDraft => ({
    title: title.value,
    noticeDays: noticeDays.value,
    renewalOn: `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    responsibleId,
    recurringRuleId,
  });
  return {
    title,
    noticeDays,
    date,
    setDate,
    responsibleId,
    setResponsibleId,
    linked,
    recurringRuleId,
    selectRule: (rule: { ruleId: string; title: string } | null) => {
      setLinked(rule);
      setRecurringRuleId(rule?.ruleId ?? null);
    },
    read,
  };
}
export type NativeRenewalFields = ReturnType<typeof useRenewalFields>;
