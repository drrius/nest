import { useSyncExternalStore } from "react";
import type { MealReminderSaveRuntime } from "./save-runtime";
import { useSaveActivity } from "../money/use-save-activity";
import { ReminderRecovery } from "./recovery";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
export function ReminderRecoveryEntry({
  runtime,
  verify,
}: {
  runtime: MealReminderSaveRuntime;
  verify: () => void;
}) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  const target = view.attempt?.command.entryId ?? view.result?.receipt?.command.entryId;
  if (view.verify)
    return (
      <Page>
        <Note>Verify your account to review saved changes.</Note>
        <NativeAction label="Verify account" onPress={verify} />
      </Page>
    );
  if (!view.active)
    return (
      <Page>
        <Note>Saved changes are hidden while inactive.</Note>
      </Page>
    );
  return (
    <Page>
      {view.notice ? <Note>{view.notice}</Note> : null}
      <RecoveryStatus runtime={runtime} target={target} />
      <NativeAction
        label="Check saved change"
        disabled={!view.online || view.busy}
        onPress={() => void runtime.refresh()}
      />
    </Page>
  );
}
function RecoveryStatus({
  runtime,
  target,
}: {
  runtime: MealReminderSaveRuntime;
  target: string | undefined;
}) {
  const view = runtime.getSnapshot();
  if (target)
    return (
      <ReminderRecovery
        runtime={runtime}
        entryId={target}
        context={null}
        next={() => runtime.acknowledge()}
      />
    );
  if (!view.online) return <Note>Connect to check the outcome of saved reminder changes.</Note>;
  if (view.busy || !view.fresh) return <Note>Checking saved reminder changes…</Note>;
  return (
    <Note>
      {view.result?.status === "cancelled"
        ? "The pending reminder change was cancelled."
        : "No saved reminder changes on this iPhone."}
    </Note>
  );
}
