import { useEffect, useState, useSyncExternalStore } from "react";
import { AppState, Linking } from "react-native";
import type { Account } from "../offline/contracts";
import type { EnrollmentDependencies, PushEnrollmentRuntime } from "../push/enrollment-runtime";
import { nativeEnrollmentOwner } from "../push/native-enrollment";
import { Card, Note, Section } from "./page";
import { NativeAction } from "./native-action";
export function PushEnrollment({
  account,
  client,
}: {
  account: Account;
  client: EnrollmentDependencies["client"];
}) {
  const [owner] = useState(() => nativeEnrollmentOwner(account, client));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? <EnrollmentControls runtime={runtime} /> : <Note>Checking this iPhone…</Note>;
}
const permissionText = {
  allowed: "iPhone permission is on.",
  quiet: "iPhone permission allows quiet notifications.",
  temporary: "iPhone permission is temporary.",
  denied: "iPhone permission is off. You can change it in Settings.",
  undetermined: "Your iPhone has not asked for notification permission yet.",
  unknown: "iPhone permission could not be checked.",
};
function EnrollmentControls({ runtime }: { runtime: PushEnrollmentRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const [settingsError, setSettingsError] = useState(false);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void runtime.load();
    });
    return () => subscription.remove();
  }, [runtime]);
  const openSettings = () => {
    setSettingsError(false);
    void Linking.openSettings().catch(() => setSettingsError(true));
  };
  return (
    <Card>
      <Section title="This iPhone" />
      <Note>{permissionText[view.permission.status]}</Note>
      <Note>{registrationText(view.enabled)}</Note>
      {view.notice ? <Note>{view.notice}</Note> : null}
      <NativeAction
        label={view.busy ? "Checking…" : "Refresh status"}
        disabled={view.busy}
        onPress={() => {
          void runtime.load();
        }}
      />
      {view.pending ? (
        <NativeAction
          label={retryLabel(view.cancelling)}
          disabled={view.busy || !view.loaded}
          onPress={() => {
            void runtime.retry();
          }}
        />
      ) : (
        <NativeAction
          label={view.enabled ? "Disable on this iPhone" : "Enable on this iPhone"}
          disabled={view.busy || !view.loaded}
          onPress={() => {
            void (view.enabled ? runtime.disable() : runtime.enable());
          }}
        />
      )}
      {view.pending ? (
        <NativeAction
          label="Cancel saved change"
          disabled={view.busy || !view.loaded}
          onPress={() => {
            void runtime.cancel();
          }}
        />
      ) : null}
      <NativeAction label="Open iPhone Settings" onPress={openSettings} />
      {settingsError ? (
        <Note>Could not open Settings. Open the Settings app and choose Nest.</Note>
      ) : null}
      <Note>
        Registration does not confirm delivery. Push delivery is not connected in this development
        build.
      </Note>
    </Card>
  );
}

function registrationText(enabled: boolean | null) {
  if (enabled === null) return "Registration has not been checked.";
  return enabled
    ? "This iPhone is registered for your notifications."
    : "This iPhone is not registered for your notifications.";
}

function retryLabel(cancelling: boolean) {
  return cancelling ? "Retry cancellation" : "Retry saved change";
}
