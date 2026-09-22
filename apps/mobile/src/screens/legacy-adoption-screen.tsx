import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { LegacyAdoptionContextQuery } from "@nest/contracts/legacy-adoption";
import { Page, Note } from "../components/page";
import { MoneyScreenGate, type MoneyScreenAccount } from "../money/screen-gate";
import { recurringReadOwner } from "../money/recurring-read-owner";
import { recurringReadOperations } from "../money/recurring-read-operations";
import { legacyAdoptionSaveOwner } from "../money/legacy-adoption-save-owner";
import { legacyAdoptionSaveOperations } from "../money/legacy-adoption-save-operations";
import { LegacyAdoptionBody } from "../money/legacy-adoption-body";
export default function LegacyAdoptionScreen() {
  const { ruleId } = useLocalSearchParams();
  if (typeof ruleId !== "string" || !Schema.is(LegacyAdoptionContextQuery)({ ruleId }))
    return (
      <Page>
        <Note>Invalid legacy adoption link.</Note>
      </Page>
    );
  return (
    <MoneyScreenGate>
      {(props) => (
        <Owned
          {...props}
          ruleId={ruleId.toLowerCase()}
          key={`${props.account.session.lease}:${ruleId}`}
        />
      )}
    </MoneyScreenGate>
  );
}
function Owned(props: MoneyScreenAccount & { ruleId: string }) {
  const [readOwner] = useState(() =>
    recurringReadOwner(recurringReadOperations(props.account, props.client), {
      kind: "legacy-adoption",
      ruleId: props.ruleId,
    }),
  );
  const [saveOwner] = useState(() =>
    legacyAdoptionSaveOwner(legacyAdoptionSaveOperations(props.account, props.client)),
  );
  const read = useSyncExternalStore(readOwner.subscribe, readOwner.getSnapshot);
  const save = useSyncExternalStore(saveOwner.subscribe, saveOwner.getSnapshot);
  return read && save ? (
    <LegacyAdoptionBody {...props} read={read} save={save} />
  ) : (
    <Page>
      <Note>Opening adoption review…</Note>
    </Page>
  );
}
