import type { RecurringReadRuntime, RecurringReadView } from "./recurring-read-runtime";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { dueManualCycle } from "./recurring-manual-confirmation";
export function ManualRulePicker({
  runtime,
  view,
}: {
  runtime: RecurringReadRuntime;
  view: RecurringReadView;
}) {
  if (!view.active || !view.online || view.busy || view.verify) return null;
  if (view.entry?.kind !== "list")
    return (
      <NativeAction
        label="Choose another recurring rule"
        onPress={() => void runtime.select({ kind: "list", after: null })}
      />
    );
  const list = view.entry.value;
  const available = list.rules.filter((rule) => dueManualCycle(rule, list.today));
  return (
    <Section title="Choose a due recurring rule">
      {available.length === 0 ? <Note>No active due rules on this page.</Note> : null}
      {available.map((rule) => (
        <NativeAction
          key={rule.ruleId}
          label={`${rule.configuration.description} · ${rule.nextDueOn}`}
          onPress={() => void runtime.select({ kind: "detail", ruleId: rule.ruleId })}
        />
      ))}
      {list.next ? (
        <NativeAction
          label="Next rules"
          onPress={() => void runtime.select({ kind: "list", after: list.next })}
        />
      ) : null}
      {list.after ? (
        <NativeAction
          label="First rules"
          onPress={() => void runtime.select({ kind: "list", after: null })}
        />
      ) : null}
    </Section>
  );
}
