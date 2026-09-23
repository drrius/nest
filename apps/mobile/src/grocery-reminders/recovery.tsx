import { reminderRecoveryReview } from "./recovery-review";
import type { ReminderEditorContext } from "./editor-context";
import { useRouter } from "expo-router";
import { useLeaveReminder } from "./use-leave-editor";
import { Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { GroceryReminderSaveRuntime } from "./save-runtime";
export function ReminderRecovery({
  runtime,
  itemId,
  context,
  next,
}: {
  runtime: GroceryReminderSaveRuntime;
  itemId: string;
  context: ReminderEditorContext | null;
  next: () => void;
}) {
  useLeaveReminder(
    runtime,
    () => false,
    () => {},
  );
  const view = runtime.getSnapshot();
  if (!view.active) return <Note>Grocery details are hidden while inactive.</Note>;
  return <RecoveryContent runtime={runtime} itemId={itemId} context={context} next={next} />;
}
function RecoveryContent({
  runtime,
  itemId,
  context,
  next,
}: {
  runtime: GroceryReminderSaveRuntime;
  itemId: string;
  context: ReminderEditorContext | null;
  next: () => void;
}) {
  const view = runtime.getSnapshot(),
    result = view.result;
  const disabled = !view.online || !view.fresh || view.busy;
  const review = recoveryReview(runtime, itemId, context);
  if (review?.target) return <OtherTarget target={review.target} disabled={disabled} />;
  const summary = review?.summary ?? null;
  if (!result || result.status === "unresolved")
    return <Pending runtime={runtime} disabled={disabled} summary={summary} />;
  return (
    <Terminal
      recorded={result.status === "recorded"}
      disabled={disabled || view.attempt !== null}
      next={next}
    />
  );
}
function Terminal({
  recorded,
  disabled,
  next,
}: {
  recorded: boolean;
  disabled: boolean;
  next: () => void;
}) {
  return (
    <>
      <Note>
        {recorded
          ? "Reminder settings saved. The grocery item is unchanged."
          : "The pending change was cancelled."}
      </Note>
      <NativeAction label="Continue" disabled={disabled} onPress={next} />
    </>
  );
}

function Pending({
  runtime,
  disabled,
  summary,
}: {
  runtime: GroceryReminderSaveRuntime;
  disabled: boolean;
  summary: string | null;
}) {
  const attempt = runtime.getSnapshot().attempt;
  return (
    <>
      {summary ? <Note>{summary}</Note> : null}
      <Note>
        The earlier change is not confirmed. Check its status before making another change.
      </Note>
      <NativeAction
        label="Retry exact change"
        disabled={disabled || !attempt}
        onPress={() => void runtime.retry()}
      />
      <NativeAction
        label="Cancel pending change"
        disabled={disabled || !attempt || attempt.action === "cancel"}
        onPress={() => {
          if (attempt) void runtime.abandon(attempt);
        }}
      />
    </>
  );
}

function recoveryReview(
  runtime: GroceryReminderSaveRuntime,
  itemId: string,
  context: ReminderEditorContext | null,
) {
  const view = runtime.getSnapshot();
  const command = view.attempt?.command ?? view.result?.receipt?.command;
  return command ? reminderRecoveryReview(command, itemId, context) : null;
}
function OtherTarget({ target, disabled }: { target: string; disabled: boolean }) {
  const router = useRouter();
  return (
    <>
      <Note>
        An earlier reminder change belongs to another grocery item. Open that grocery item to review
        its settings and outcome.
      </Note>
      <NativeAction
        label="Open pending reminder"
        disabled={disabled}
        onPress={() =>
          router.replace({ pathname: "/grocery-reminder", params: { itemId: target } })
        }
      />
    </>
  );
}
