import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { RenewalQuery } from "@nest/contracts/renewals";
import { Page, Note } from "../components/page";
import { RenewalEditorGate, type RenewalEditorAccount } from "../renewals/editor-gate";
import { renewalSaveOwner } from "../renewals/save-owner";
import { renewalSaveOperations } from "../renewals/save-operations";
import { RenewalEditorBody } from "../renewals/editor-body";
export default function RenewalEditorScreen() {
  const { renewalId } = useLocalSearchParams();
  if (renewalId !== undefined && !Schema.is(RenewalQuery)({ renewalId }))
    return (
      <Page>
        <Note>Invalid renewal link.</Note>
      </Page>
    );
  const target = typeof renewalId === "string" ? renewalId.toLowerCase() : null;
  return (
    <RenewalEditorGate>
      {(props) => (
        <Owned {...props} renewalId={target} key={`${props.account.session.lease}:${target}`} />
      )}
    </RenewalEditorGate>
  );
}
function Owned(props: RenewalEditorAccount & { renewalId: string | null }) {
  const [owner] = useState(() =>
    renewalSaveOwner(renewalSaveOperations(props.account, props.client)),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <RenewalEditorBody {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening renewal editor…</Note>
    </Page>
  );
}
