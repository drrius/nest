import { ReminderRecoveryEntry } from "../recurring-reminders/recovery-entry";
import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { RecurringReminderQuery } from "@nest/contracts/recurring-reminders";
import { Page, Note } from "../components/page";
import { ReminderEditorGate, type ReminderEditorAccount } from "../recurring-reminders/editor-gate";
import { recurringReminderSaveOwner } from "../recurring-reminders/save-owner";
import { recurringReminderSaveOperations } from "../recurring-reminders/save-operations";
import { ReminderEditorBody } from "../recurring-reminders/editor-body";
export default function ReminderEditorScreen() {
  const { ruleId } = useLocalSearchParams();
  if (ruleId !== undefined && !Schema.is(RecurringReminderQuery)({ ruleId }))
    return (
      <Page>
        <Note>Invalid recurring link.</Note>
      </Page>
    );
  const target = typeof ruleId === "string" ? ruleId.toLowerCase() : null;
  return (
    <ReminderEditorGate>
      {(props) => (
        <Owned {...props} ruleId={target} key={`${props.account.session.lease}:${target}`} />
      )}
    </ReminderEditorGate>
  );
}
function Owned(props: ReminderEditorAccount & { ruleId: string | null }) {
  const [owner] = useState(() =>
    recurringReminderSaveOwner(recurringReminderSaveOperations(props.account, props.reminders)),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    props.ruleId ? (
      <ReminderEditorBody {...props} ruleId={props.ruleId} runtime={runtime} />
    ) : (
      <ReminderRecoveryEntry runtime={runtime} verify={props.verify} />
    )
  ) : (
    <Page>
      <Note>Opening recurring editor…</Note>
    </Page>
  );
}
