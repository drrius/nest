import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { RenewalQuery } from "@nest/contracts/renewals";
import { Page, Note } from "../components/page";
import {
  RenewalScreenGate,
  VerifyRenewal,
  type RenewalScreenAccount,
} from "../renewals/screen-gate";
import { renewalReadOwner } from "../renewals/read-owner";
import { renewalReadOperations, type RenewalReadTarget } from "../renewals/read-operations";
import type { RenewalReadRuntime } from "../renewals/read-runtime";
import { RenewalReadContent } from "../renewals/read-content";
import { useSaveActivity } from "../money/use-save-activity";
export function RenewalListScreen() {
  return <ReadScreen target={{ kind: "list", after: null }} />;
}
export function RenewalDetailScreen() {
  const { renewalId } = useLocalSearchParams();
  if (!Schema.is(RenewalQuery)({ renewalId }))
    return (
      <Page>
        <Note>Invalid renewal link.</Note>
      </Page>
    );
  return <ReadScreen target={{ kind: "detail", renewalId: String(renewalId).toLowerCase() }} />;
}
function ReadScreen({ target }: { target: RenewalReadTarget }) {
  return (
    <RenewalScreenGate>
      {(props) => (
        <OwnedRead
          {...props}
          target={target}
          key={`${props.account.session.lease}:${target.kind === "list" ? "list" : target.renewalId}`}
        />
      )}
    </RenewalScreenGate>
  );
}
function OwnedRead(props: RenewalScreenAccount & { target: RenewalReadTarget }) {
  const [owner] = useState(() =>
    renewalReadOwner(renewalReadOperations(props.account, props.client), props.target),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveRead {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening renewals…</Note>
    </Page>
  );
}
function ActiveRead({ runtime, verify }: RenewalScreenAccount & { runtime: RenewalReadRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  if (view.verify) return <VerifyRenewal verify={verify} />;
  return <RenewalReadContent runtime={runtime} view={view} />;
}
