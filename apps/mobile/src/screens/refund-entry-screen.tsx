import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { RefundContextQuery } from "@nest/contracts/refund";
import { useState, useSyncExternalStore } from "react";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { refundSaveOwner } from "../money/refund-save-owner";
import { refundSaveOperations } from "../money/refund-save-operations";
import type { RefundSaveRuntime } from "../money/refund-save-runtime";
import { useSaveActivity } from "../money/use-save-activity";
import { useRefundContext } from "../money/use-refund-context";
import { useRefundDraft } from "../money/use-refund-draft";
import { RefundFields } from "../money/refund-fields";
import { RefundSaveStatus, refundSaveEnabled } from "../money/refund-save-status";
export default function RefundEntryScreen() {
  const { sourceEventId } = useLocalSearchParams();
  if (typeof sourceEventId !== "string" || !Schema.is(RefundContextQuery)({ sourceEventId }))
    return (
      <Page>
        <Note>This refund link is invalid.</Note>
      </Page>
    );
  return (
    <MoneyScreenGate>
      {(props) => (
        <Entry
          key={`${props.account.session.lease}:${sourceEventId}`}
          {...props}
          sourceEventId={sourceEventId}
        />
      )}
    </MoneyScreenGate>
  );
}
function Entry(props: MoneyScreenAccount & { sourceEventId: string }) {
  const [owner] = useState(() =>
    refundSaveOwner(refundSaveOperations(props.account, props.client)),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveEntry {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening refund entry…</Note>
    </Page>
  );
}
function ActiveEntry(
  props: MoneyScreenAccount & { runtime: RefundSaveRuntime; sourceEventId: string },
) {
  const { runtime } = props,
    view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  const balance = useRefundContext(props, view.active && !view.verify, view.online);
  const draft = useRefundDraft(balance.value, runtime, balance.reload, props.account.session.actor);
  if (view.verify || balance.verify) return <VerifyMoney verify={props.verify} />;
  if (!view.active)
    return (
      <Page>
        <Note>Refund entry is paused.</Note>
      </Page>
    );
  return (
    <EntryPage
      runtime={runtime}
      view={view}
      balance={balance}
      draft={draft}
      actor={props.account.session.actor}
    />
  );
}
function EntryPage({
  runtime,
  view,
  balance,
  draft,
  actor,
}: {
  runtime: RefundSaveRuntime;
  view: ReturnType<RefundSaveRuntime["getSnapshot"]>;
  balance: ReturnType<typeof useRefundContext>;
  draft: ReturnType<typeof useRefundDraft>;
  actor: string;
}) {
  const recovery = view.attempt !== null || view.result !== null;
  const disabled = !refundSaveEnabled(view) || balance.value === null;
  const readingDisabled = !view.online || view.busy;
  return (
    <Page>
      <Note>
        Record a refund already received outside Nest. The original expense remains in history.
      </Note>
      {!view.online ? (
        <Note>
          Go online to record or resolve a refund. Financial writes are never queued offline.
        </Note>
      ) : null}
      {view.busy ? <Note>Checking the refund…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {recovery ? (
        <RefundSaveStatus runtime={runtime} view={view} next={draft.nextRefund} actor={actor} />
      ) : (
        <>
          {balance.value ? (
            <RefundFields draft={draft} balance={balance.value} disabled={disabled} actor={actor} />
          ) : (
            <Note>
              {balance.failed
                ? "Could not load your current refundable shares. Your input is retained."
                : "Loading the current refundable shares…"}
            </Note>
          )}
          <NativeAction
            label="Reload current refundable shares"
            disabled={readingDisabled}
            onPress={balance.reload}
          />
        </>
      )}
      <NativeAction
        label="Check Save status"
        disabled={readingDisabled}
        onPress={() => void runtime.refresh()}
      />
    </Page>
  );
}
