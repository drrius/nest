import { ReminderRecoveryEntry } from "../meal-reminders/recovery-entry";
import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { MealReminderQuery } from "@nest/contracts/meal-reminders";
import { Page, Note } from "../components/page";
import { ReminderEditorGate, type ReminderEditorAccount } from "../meal-reminders/editor-gate";
import { mealReminderSaveOwner } from "../meal-reminders/save-owner";
import { mealReminderSaveOperations } from "../meal-reminders/save-operations";
import { ReminderEditorBody } from "../meal-reminders/editor-body";
export default function ReminderEditorScreen() {
  const { entryId } = useLocalSearchParams();
  if (entryId !== undefined && !Schema.is(MealReminderQuery)({ entryId }))
    return (
      <Page>
        <Note>Invalid meal link.</Note>
      </Page>
    );
  const target = typeof entryId === "string" ? entryId.toLowerCase() : null;
  return (
    <ReminderEditorGate>
      {(props) => (
        <Owned {...props} entryId={target} key={`${props.account.session.lease}:${target}`} />
      )}
    </ReminderEditorGate>
  );
}
function Owned(props: ReminderEditorAccount & { entryId: string | null }) {
  const [owner] = useState(() =>
    mealReminderSaveOwner(mealReminderSaveOperations(props.account, props.reminders)),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    props.entryId ? (
      <ReminderEditorBody {...props} entryId={props.entryId} runtime={runtime} />
    ) : (
      <ReminderRecoveryEntry runtime={runtime} verify={props.verify} />
    )
  ) : (
    <Page>
      <Note>Opening meal editor…</Note>
    </Page>
  );
}
