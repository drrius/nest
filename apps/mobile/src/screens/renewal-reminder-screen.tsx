import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { RenewalQuery } from "@nest/contracts/renewals";
import { Page, Note } from "../components/page";
import { ReminderEditorGate, type ReminderEditorAccount } from "../renewal-reminders/editor-gate";
import { renewalReminderSaveOwner } from "../renewal-reminders/save-owner";
import { renewalReminderSaveOperations } from "../renewal-reminders/save-operations";
import { ReminderEditorBody } from "../renewal-reminders/editor-body";
export default function ReminderEditorScreen() {
  const { renewalId } = useLocalSearchParams();
  if (!Schema.is(RenewalQuery)({ renewalId }))
    return (
      <Page>
        <Note>Invalid renewal link.</Note>
      </Page>
    );
  const target = (renewalId as string).toLowerCase();
  return (
    <ReminderEditorGate>
      {(props) => (
        <Owned {...props} renewalId={target} key={`${props.account.session.lease}:${target}`} />
      )}
    </ReminderEditorGate>
  );
}
function Owned(props: ReminderEditorAccount & { renewalId: string }) {
  const [owner] = useState(() =>
    renewalReminderSaveOwner(renewalReminderSaveOperations(props.account, props.reminders)),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ReminderEditorBody {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening renewal editor…</Note>
    </Page>
  );
}
