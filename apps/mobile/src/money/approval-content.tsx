import { useApprovalClock } from "./use-approval-clock";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Page, Section, Card, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { ExpenseApprovalRuntime, ExpenseApprovalView } from "./approval-runtime";
import { approvalActions, expenseConfirmation, memberLabel } from "./approval-display";
import { formatChf } from "./format";
interface Props {
  runtime: ExpenseApprovalRuntime;
  view: ExpenseApprovalView;
  actor: string;
}
export function ExpenseApprovalContent(props: Props) {
  const { view, runtime, actor } = props;
  return (
    <Page>
      <Note>Private expense proposal · only your confirmation records it in shared Money.</Note>
      {view.busy ? <Note>Checking the expense proposal…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.approval ? (
        <>
          {!view.fresh ? (
            <Note>Previously loaded proposal. Reload online before making a decision.</Note>
          ) : null}
          <ExpenseSummary view={view} actor={actor} />
          <DecisionControls {...props} />
        </>
      ) : null}
      <NativeAction
        label="Reload current status"
        disabled={!view.active || view.busy}
        onPress={() => void runtime.refresh()}
      />
    </Page>
  );
}
function ExpenseSummary({ view, actor }: Pick<Props, "view" | "actor">) {
  const expense = view.approval!.expense;
  return (
    <>
      <Section title={expense.description}>
        <Note>
          {formatChf(expense.amountCentimes)} · {expense.date}
        </Note>
        <Note>Paid by {expense.payerId === actor ? "you" : "your partner"}</Note>
      </Section>
      <Section title="Each person’s share">
        {expense.allocations.map((share) => (
          <Card key={share.memberId}>
            <Note>
              {memberLabel(share.memberId, actor)} · {formatChf(share.centimes)}
            </Note>
          </Card>
        ))}
      </Section>
      <Section title="Category">
        <Note>
          {expense.categoryId === null
            ? "No category"
            : view.category
              ? `${view.category.name}${view.category.archived ? " · archived" : ""}`
              : "Category unavailable"}
        </Note>
      </Section>
      {expense.note !== null ? (
        <Section title="Note">
          <Note>{expense.note}</Note>
        </Section>
      ) : null}
    </>
  );
}
function DecisionControls({ runtime, view, actor }: Props) {
  const router = useRouter(),
    approval = view.approval!;
  const actions = approvalActions(view, useApprovalClock(approval.expiresAt));
  if (approval.status === "consumed")
    return (
      <Section title="Expense recorded">
        <Note>The server confirmed this expense. Its financial history is retained.</Note>
        <NativeAction
          label="View recorded expense"
          onPress={() =>
            router.push({
              pathname: "/money-event",
              params: { eventId: approval.receipt!.eventId },
            })
          }
        />
      </Section>
    );
  if (approval.status === "denied")
    return <Note>Proposal declined. This proposal did not post an expense.</Note>;
  if (view.attempt)
    return (
      <Section title="Earlier decision">
        <Note>
          You chose to {view.attempt.approved ? "confirm" : "decline"} this exact proposal. Reload
          to check its outcome, or explicitly retry the same decision.
        </Note>
        <NativeAction
          label={view.attempt.approved ? "Retry confirmation" : "Retry decline"}
          disabled={!actions.retry}
          onPress={() => void runtime.retry()}
        />
      </Section>
    );
  const confirm = () =>
    Alert.alert("Record this expense?", expenseConfirmation(approval, actor), [
      { text: "Cancel", style: "cancel" },
      { text: "Record expense", onPress: () => void runtime.decide(approval, true) },
    ]);
  const decline = () =>
    Alert.alert("Decline this proposal?", "This proposal will not record an expense.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline proposal",
        style: "destructive",
        onPress: () => void runtime.decide(approval, false),
      },
    ]);
  return (
    <Section title="Your decision">
      <Note>
        {actions.expired
          ? "This proposal has expired. Ask the assistant for a new proposal if you still want to record it."
          : "Review the exact payer and split. Recording updates your shared balance; Nest does not transfer money."}
      </Note>
      <NativeAction
        label="Confirm and record expense"
        disabled={!actions.confirm}
        onPress={confirm}
      />
      <NativeAction label="Decline proposal" disabled={!actions.deny} onPress={decline} />
    </Section>
  );
}
