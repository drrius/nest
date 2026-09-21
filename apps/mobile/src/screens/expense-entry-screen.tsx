import { useState, useSyncExternalStore } from "react";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { expenseEntryOwner } from "../money/expense-entry-owner";
import { receiptAttachmentOperations } from "../money/receipt-attachment-operations";
import { selectNativeReceipt } from "../money/receipt-selection-native";
import type { ReceiptAttachmentRuntime } from "../money/receipt-attachment-runtime";
import { ReceiptAttachmentControls } from "../money/receipt-attachment-controls";
import { receiptReady } from "../money/receipt-draft";
import { expenseSaveOperations } from "../money/save-operations";
import type { ExpenseSaveRuntime } from "../money/save-runtime";
import { useSaveActivity } from "../money/use-save-activity";
import { useEntryOptions } from "../money/use-entry-options";
import { useExpenseDraft } from "../money/use-expense-draft";
import { ExpenseFields } from "../money/expense-fields";
import { ExpenseSaveStatus, expenseSaveEnabled } from "../money/save-status";
export function GroceryExpenseScreen() {
  return <ExpenseEntryScreen grocery />;
}
export default function ExpenseEntryScreen({ grocery = false }: { grocery?: boolean }) {
  return (
    <MoneyScreenGate>
      {(props) => <Entry key={props.account.session.lease} {...props} grocery={grocery} />}
    </MoneyScreenGate>
  );
}
function Entry(props: MoneyScreenAccount & { grocery: boolean }) {
  const [owner] = useState(() =>
    expenseEntryOwner(
      expenseSaveOperations(props.account, props.client),
      receiptAttachmentOperations(props.account, props.client, selectNativeReceipt),
    ),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveEntry {...props} runtime={runtime.save} attachment={runtime.attachment} />
  ) : (
    <Page>
      <Note>Opening expense entry…</Note>
    </Page>
  );
}
function ActiveEntry(
  props: MoneyScreenAccount & {
    runtime: ExpenseSaveRuntime;
    attachment: ReceiptAttachmentRuntime;
    grocery: boolean;
  },
) {
  const { runtime } = props,
    view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  useSaveActivity(props.attachment);
  const attachmentView = useSyncExternalStore(
    props.attachment.subscribe,
    props.attachment.getSnapshot,
  );
  const options = useEntryOptions(props, view.active && !view.verify, view.online);
  const draft = useExpenseDraft(
    props.account.session.actor,
    options.value?.members ?? null,
    runtime,
    { grocery: props.grocery, attachment: props.attachment },
  );
  if (view.verify || options.verify || attachmentView.verify)
    return <VerifyMoney verify={props.verify} />;
  if (!view.active)
    return (
      <Page>
        <Note>Expense entry is paused.</Note>
      </Page>
    );
  return (
    <EntryPage
      runtime={runtime}
      attachment={props.attachment}
      attachmentView={attachmentView}
      view={view}
      options={options}
      draft={draft}
      actor={props.account.session.actor}
    />
  );
}
function EntryPage({
  runtime,
  attachment,
  attachmentView,
  view,
  options,
  draft,
  actor,
}: {
  runtime: ExpenseSaveRuntime;
  attachment: ReceiptAttachmentRuntime;
  attachmentView: ReturnType<ReceiptAttachmentRuntime["getSnapshot"]>;
  view: ReturnType<ExpenseSaveRuntime["getSnapshot"]>;
  options: ReturnType<typeof useEntryOptions>;
  draft: ReturnType<typeof useExpenseDraft>;
  actor: string;
}) {
  const recovery = view.attempt !== null || view.result !== null;
  const disabled = !expenseEntryEnabled(view, options.fresh);
  const readingDisabled = !view.online || view.busy;
  return (
    <Page>
      <Note>
        Record a shared expense in CHF. Nest updates your household balance; it does not transfer
        money.
      </Note>
      {!view.online ? (
        <Note>
          Go online to record or resolve an expense. Financial writes are never queued offline.
        </Note>
      ) : null}
      {view.busy ? <Note>Checking the expense…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {recovery ? (
        <ExpenseSaveStatus runtime={runtime} view={view} next={draft.nextExpense} actor={actor} />
      ) : (
        <>
          {options.value ? (
            <ExpenseFields
              draft={draft}
              options={options.value}
              disabled={!receiptFormEnabled(disabled, attachmentView)}
              first={options.first}
              next={options.next}
            />
          ) : (
            <Note>
              {options.failed
                ? "Could not load expense choices. Your input is retained."
                : "Loading current household members and categories…"}
            </Note>
          )}
          <ReceiptAttachmentControls
            expense={runtime}
            runtime={attachment}
            view={attachmentView}
            disabled={disabled}
          />
          <NativeAction
            label="Reload expense choices"
            disabled={readingDisabled}
            onPress={options.reload}
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

function expenseEntryEnabled(view: ReturnType<ExpenseSaveRuntime["getSnapshot"]>, fresh: boolean) {
  return expenseSaveEnabled(view) && fresh;
}
function receiptFormEnabled(
  disabled: boolean,
  view: ReturnType<ReceiptAttachmentRuntime["getSnapshot"]>,
) {
  return !disabled && receiptReady(view);
}
