import { GroceryExpenseSummary } from "./grocery-expense-summary";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { ExpenseSaveRuntime, ExpenseSaveView } from "./save-runtime";
import { formatChf } from "./format";
interface Props {
  runtime: ExpenseSaveRuntime;
  view: ExpenseSaveView;
  next: () => void;
  actor: string;
}
export function expenseSaveEnabled(view: ExpenseSaveView) {
  return view.active && view.online && view.fresh && !view.busy;
}
export function ExpenseSaveStatus(props: Props) {
  const { view, next } = props;
  if (view.result?.status === "recorded") return <Recorded view={view} />;
  if (view.result?.status === "cancelled")
    return (
      <Section title="Save cancelled">
        <Note>
          This attempt cannot post an expense. You can edit your input and start a new Save.
        </Note>
        <NativeAction
          label="Return to expense form"
          disabled={!expenseSaveEnabled(view) || view.attempt !== null}
          onPress={next}
        />
      </Section>
    );
  return view.attempt ? <Unresolved {...props} /> : null;
}
function Recorded({ view }: { view: ExpenseSaveView }) {
  const router = useRouter(),
    receipt = view.result!.receipt!;
  return (
    <Section title="Expense recorded">
      <Note>
        {receipt.expense.description} · {formatChf(receipt.expense.amountCentimes)}
      </Note>
      <GroceryExpenseSummary expense={receipt.expense} />
      <Note>The server confirmed this expense. Its financial history is retained.</Note>
      <NativeAction
        label="View recorded expense"
        onPress={() =>
          router.push({ pathname: "/money-event", params: { eventId: receipt.eventId } })
        }
      />
    </Section>
  );
}
function Unresolved({ runtime, view, actor }: Props) {
  const attempt = view.attempt!,
    expense = attempt.command.expense,
    enabled = expenseSaveEnabled(view);
  return (
    <Section title="Earlier expense attempt">
      <Note>
        {expense.description} · {formatChf(expense.amountCentimes)} · {expense.date}
      </Note>
      <GroceryExpenseSummary expense={expense} />
      <Note>Paid by {expense.payerId === actor ? "you" : "your partner"}</Note>
      {expense.allocations.map((share) => (
        <Note key={share.memberId}>
          {share.memberId === actor ? "Your share" : "Partner’s share"}: {formatChf(share.centimes)}
        </Note>
      ))}
      {expense.note ? <Note>{expense.note}</Note> : null}
      <Note>
        {attempt.action === "cancel"
          ? "Cancellation was requested. Check its outcome or explicitly retry cancellation."
          : "This exact expense is retained until its outcome is known. Checking status never resends it."}
      </Note>
      <NativeAction
        label={attempt.action === "cancel" ? "Retry cancellation" : "Retry exact Save"}
        disabled={!enabled}
        onPress={() => void runtime.retry()}
      />
      {attempt.action === "save" ? (
        <NativeAction
          label="Cancel this Save"
          disabled={!enabled}
          onPress={() =>
            Alert.alert(
              "Cancel this Save?",
              "If it already recorded, Nest will show its receipt. Otherwise cancellation permanently prevents this attempt from posting.",
              [
                { text: "Keep checking", style: "cancel" },
                {
                  text: "Cancel Save",
                  style: "destructive",
                  onPress: () => void runtime.cancel(attempt),
                },
              ],
            )
          }
        />
      ) : null}
    </Section>
  );
}
