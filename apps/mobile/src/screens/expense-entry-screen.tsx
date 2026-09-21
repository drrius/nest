import { useState, useSyncExternalStore } from "react";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { expenseSaveOwner } from "../money/save-owner";
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
    expenseSaveOwner(expenseSaveOperations(props.account, props.client)),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveEntry {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening expense entry…</Note>
    </Page>
  );
}
function ActiveEntry(
  props: MoneyScreenAccount & { runtime: ExpenseSaveRuntime; grocery: boolean },
) {
  const { runtime } = props,
    view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  const options = useEntryOptions(props, view.active && !view.verify, view.online);
  const draft = useExpenseDraft(
    props.account.session.actor,
    options.value?.members ?? null,
    runtime,
    props.grocery,
  );
  if (view.verify || options.verify) return <VerifyMoney verify={props.verify} />;
  if (!view.active)
    return (
      <Page>
        <Note>Expense entry is paused.</Note>
      </Page>
    );
  return (
    <EntryPage
      runtime={runtime}
      view={view}
      options={options}
      draft={draft}
      actor={props.account.session.actor}
    />
  );
}
function EntryPage({
  runtime,
  view,
  options,
  draft,
  actor,
}: {
  runtime: ExpenseSaveRuntime;
  view: ReturnType<ExpenseSaveRuntime["getSnapshot"]>;
  options: ReturnType<typeof useEntryOptions>;
  draft: ReturnType<typeof useExpenseDraft>;
  actor: string;
}) {
  const recovery = view.attempt !== null || view.result !== null;
  const disabled = !expenseSaveEnabled(view) || !options.fresh;
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
              disabled={disabled}
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
