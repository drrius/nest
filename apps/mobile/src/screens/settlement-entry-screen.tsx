import { useState, useSyncExternalStore } from "react";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { settlementSaveOwner } from "../money/settlement-save-owner";
import { settlementSaveOperations } from "../money/settlement-save-operations";
import type { SettlementSaveRuntime } from "../money/settlement-save-runtime";
import { useSaveActivity } from "../money/use-save-activity";
import { useSettlementBalance } from "../money/use-settlement-balance";
import { useSettlementDraft } from "../money/use-settlement-draft";
import { SettlementFields } from "../money/settlement-fields";
import { SettlementSaveStatus, settlementSaveEnabled } from "../money/settlement-save-status";
export default function SettlementEntryScreen() {
  return (
    <MoneyScreenGate>
      {(props) => <Entry key={props.account.session.lease} {...props} />}
    </MoneyScreenGate>
  );
}
function Entry(props: MoneyScreenAccount) {
  const [owner] = useState(() =>
    settlementSaveOwner(settlementSaveOperations(props.account, props.client)),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveEntry {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening settlement entry…</Note>
    </Page>
  );
}
function ActiveEntry(props: MoneyScreenAccount & { runtime: SettlementSaveRuntime }) {
  const { runtime } = props,
    view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  const balance = useSettlementBalance(props, view.active && !view.verify, view.online);
  const draft = useSettlementDraft(balance.value, runtime, balance.reload);
  if (view.verify || balance.verify) return <VerifyMoney verify={props.verify} />;
  if (!view.active)
    return (
      <Page>
        <Note>Settlement entry is paused.</Note>
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
  runtime: SettlementSaveRuntime;
  view: ReturnType<SettlementSaveRuntime["getSnapshot"]>;
  balance: ReturnType<typeof useSettlementBalance>;
  draft: ReturnType<typeof useSettlementDraft>;
  actor: string;
}) {
  const recovery = view.attempt !== null || view.result !== null;
  const disabled = !settlementSaveEnabled(view) || balance.value === null;
  const readingDisabled = !view.online || view.busy;
  return (
    <Page>
      <Note>
        Record a payment already made outside Nest. This updates your household balance; Nest does
        not transfer money.
      </Note>
      {!view.online ? (
        <Note>
          Go online to record or resolve a settlement. Financial writes are never queued offline.
        </Note>
      ) : null}
      {view.busy ? <Note>Checking the settlement…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {recovery ? (
        <SettlementSaveStatus
          runtime={runtime}
          view={view}
          next={draft.nextSettlement}
          actor={actor}
        />
      ) : (
        <>
          {balance.value ? (
            <SettlementFields draft={draft} balance={balance.value} disabled={disabled} />
          ) : (
            <Note>
              {balance.failed
                ? "Could not load your current balance. Your input is retained."
                : "Loading the current household balance…"}
            </Note>
          )}
          <NativeAction
            label="Reload current balance"
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
