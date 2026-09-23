import { ReminderRecoveryEntry } from "../chore-reminders/recovery-entry";
import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { ChoreReminderQuery } from "@nest/contracts/chore-reminders";
import { Page, Note } from "../components/page";
import { ReminderEditorGate, type ReminderEditorAccount } from "../chore-reminders/editor-gate";
import { choreReminderSaveOwner } from "../chore-reminders/save-owner";
import { choreReminderSaveOperations } from "../chore-reminders/save-operations";
import { ReminderEditorBody } from "../chore-reminders/editor-body";
export default function ReminderEditorScreen() {
  const { occurrenceId } = useLocalSearchParams();
  if (occurrenceId !== undefined && !Schema.is(ChoreReminderQuery)({ occurrenceId }))
    return (
      <Page>
        <Note>Invalid chore link.</Note>
      </Page>
    );
  const target = typeof occurrenceId === "string" ? occurrenceId.toLowerCase() : null;
  return (
    <ReminderEditorGate>
      {(props) => (
        <Owned {...props} occurrenceId={target} key={`${props.account.session.lease}:${target}`} />
      )}
    </ReminderEditorGate>
  );
}
function Owned(props: ReminderEditorAccount & { occurrenceId: string | null }) {
  const [owner] = useState(() =>
    choreReminderSaveOwner(choreReminderSaveOperations(props.account, props.reminders)),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    props.occurrenceId ? (
      <ReminderEditorBody {...props} occurrenceId={props.occurrenceId} runtime={runtime} />
    ) : (
      <ReminderRecoveryEntry runtime={runtime} verify={props.verify} />
    )
  ) : (
    <Page>
      <Note>Opening chore editor…</Note>
    </Page>
  );
}
