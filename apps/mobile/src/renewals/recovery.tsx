import { useLeaveRenewal } from "./use-leave-editor";
import { Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { RenewalSaveRuntime } from "./save-runtime";
export function RenewalRecovery({
  runtime,
  next,
}: {
  runtime: RenewalSaveRuntime;
  next: () => void;
}) {
  useLeaveRenewal(
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
        <Note>{recordedLabel(result.receipt)} Financial history is unchanged.</Note>
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
function Pending({ runtime, disabled }: { runtime: RenewalSaveRuntime; disabled: boolean }) {
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

function recordedLabel(receipt: { action: string } | null) {
  return receipt?.action === "removed" ? "Renewal removed." : "Renewal saved.";
}
