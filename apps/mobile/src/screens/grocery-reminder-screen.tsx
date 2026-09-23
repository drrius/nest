import { ReminderRecoveryEntry } from "../grocery-reminders/recovery-entry";
import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { GroceryReminderQuery } from "@nest/contracts/grocery-reminders";
import { Page, Note } from "../components/page";
import { ReminderEditorGate, type ReminderEditorAccount } from "../grocery-reminders/editor-gate";
import { groceryReminderSaveOwner } from "../grocery-reminders/save-owner";
import { groceryReminderSaveOperations } from "../grocery-reminders/save-operations";
import { ReminderEditorBody } from "../grocery-reminders/editor-body";
export default function ReminderEditorScreen() {
  const { itemId } = useLocalSearchParams();
  if (itemId !== undefined && !Schema.is(GroceryReminderQuery)({ itemId }))
    return (
      <Page>
        <Note>Invalid grocery link.</Note>
      </Page>
    );
  const target = typeof itemId === "string" ? itemId.toLowerCase() : null;
  return (
    <ReminderEditorGate>
      {(props) => (
        <Owned {...props} itemId={target} key={`${props.account.session.lease}:${target}`} />
      )}
    </ReminderEditorGate>
  );
}
function Owned(props: ReminderEditorAccount & { itemId: string | null }) {
  const [owner] = useState(() =>
    groceryReminderSaveOwner(groceryReminderSaveOperations(props.account, props.reminders)),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    props.itemId ? (
      <ReminderEditorBody {...props} itemId={props.itemId} runtime={runtime} />
    ) : (
      <ReminderRecoveryEntry runtime={runtime} verify={props.verify} />
    )
  ) : (
    <Page>
      <Note>Opening grocery editor…</Note>
    </Page>
  );
}
