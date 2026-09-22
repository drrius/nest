import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { LegacyDraftContextQuery } from "@nest/contracts/legacy-draft-dismissal";
import { Page, Note } from "../components/page";
import { MoneyScreenGate, type MoneyScreenAccount } from "../money/screen-gate";
import { recurringReadOwner } from "../money/recurring-read-owner";
import { recurringReadOperations } from "../money/recurring-read-operations";
import { legacyConfirmationSaveOwner } from "../money/legacy-confirmation-save-owner";
import { legacyConfirmationSaveOperations } from "../money/legacy-confirmation-save-operations";
import { LegacyConfirmationBody } from "../money/legacy-confirmation-body";
export default function LegacyConfirmationScreen() {
  const { draftId } = useLocalSearchParams();
  if (typeof draftId !== "string" || !Schema.is(LegacyDraftContextQuery)({ draftId }))
    return (
      <Page>
        <Note>Invalid legacy draft link.</Note>
      </Page>
    );
  return (
    <MoneyScreenGate>
      {(props) => (
        <Owned
          {...props}
          draftId={draftId.toLowerCase()}
          key={`${props.account.session.lease}:${draftId}`}
        />
      )}
    </MoneyScreenGate>
  );
}
function Owned(props: MoneyScreenAccount & { draftId: string }) {
  const [readOwner] = useState(() =>
    recurringReadOwner(recurringReadOperations(props.account, props.client), {
      kind: "legacy-review",
      draftId: props.draftId,
    }),
  );
  const [saveOwner] = useState(() =>
    legacyConfirmationSaveOwner(legacyConfirmationSaveOperations(props.account, props.client)),
  );
  const read = useSyncExternalStore(readOwner.subscribe, readOwner.getSnapshot);
  const save = useSyncExternalStore(saveOwner.subscribe, saveOwner.getSnapshot);
  return read && save ? (
    <LegacyConfirmationBody {...props} read={read} save={save} />
  ) : (
    <Page>
      <Note>Opening draft review…</Note>
    </Page>
  );
}
