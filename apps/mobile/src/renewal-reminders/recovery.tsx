import { useLeaveReminder } from "./use-leave-editor";
import { Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { RenewalReminderSaveRuntime } from "./save-runtime";
export function ReminderRecovery({
  runtime,
  next,
}: {
  runtime: RenewalReminderSaveRuntime;
  next: () => void;
}) {
  useLeaveReminder(
    runtime,
    () => false,
    () => {},
  );
  const view = runtime.getSnapshot(),
    result = view.result;
  const disabled = !view.active || !view.online || !view.fresh || view.busy;
  if (!view.active) return <Note>Renewal details are hidden while inactive.</Note>;
  if (!result) return <Pending runtime={runtime} disabled={disabled} />;
  if (result.status === "recorded")
    return (
      <>
        <Note>Reminder settings saved. Financial history is unchanged.</Note>
        <NativeAction
          label="Continue"
          disabled={disabled || view.attempt !== null}
          onPress={next}
        />
      </>
    );
  if (result.status === "cancelled")
    return (
      <>
        <Note>The pending change was cancelled.</Note>
        <NativeAction
          label="Continue"
          disabled={disabled || view.attempt !== null}
          onPress={next}
        />
      </>
    );
  return <Pending runtime={runtime} disabled={disabled} />;
}
function Pending({
  runtime,
  disabled,
}: {
  runtime: RenewalReminderSaveRuntime;
  disabled: boolean;
}) {
  const attempt = runtime.getSnapshot().attempt;
  return (
    <>
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
