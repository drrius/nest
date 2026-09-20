import { Alert, Linking, View } from "react-native";
import type { CalendarRuntime, CalendarView } from "../calendar/runtime";
import { Card, Section, Note } from "./page";
import { NativeAction } from "./native-action";
type Props = { runtime: CalendarRuntime; view: CalendarView; verify: () => void };
export function CalendarSharingHeader({
  runtime,
  view,
  verify,
  ids,
}: Props & { ids: readonly string[] }) {
  const enabled = !view.busy && view.stage === "ready";
  return (
    <View style={{ gap: 16 }}>
      <Card>
        <Section title="Your calendars stay on your iPhone" />
        <Note>
          Choose calendars whose busy times you want to share with your partner and Nest’s
          assistant. Titles, locations, notes, attendees and calendar names are never uploaded.
        </Note>
        <Note>
          Sharing covers the next 31 days. Busy times expire after 15 minutes without a refresh.
          Missing availability means unknown, not free.
        </Note>
      </Card>
      <SharingStatus runtime={runtime} view={view} verify={verify} />
      {!view.permission && <CalendarPermission runtime={runtime} enabled={enabled} />}
      {view.permission && (
        <Card>
          <Section title="Share busy times from" />
          <Note>
            Each selected calendar shares only busy intervals. Shared iCloud events remain in
            iCloud.
          </Note>
          <NativeAction
            label="Share selected busy times"
            disabled={!enabled || !ids.length}
            onPress={() => {
              void runtime.change(ids, true).then(() => runtime.refresh());
            }}
          />
          <NativeAction
            label="Refresh busy times"
            disabled={!enabled || view.selection?.status !== "active"}
            onPress={() => {
              void runtime.refresh();
            }}
          />
        </Card>
      )}
    </View>
  );
}
function SharingStatus({ runtime, view, verify }: Props) {
  return (
    <Card>
      <Section title={view.consent?.enabled ? "Busy sharing is on" : "Busy sharing is off"} />
      <PublishingDevice view={view} />
      <Note>
        Refreshes run while Nest is open and when it returns to the foreground. Background updates
        are not guaranteed.
      </Note>
      {view.notice && <Note>{view.notice}</Note>}
      {view.expiresAt && (
        <Note>
          Current busy times expire at{" "}
          {new Date(view.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
        </Note>
      )}
      <Recovery runtime={runtime} view={view} verify={verify} />
      {view.consent?.enabled && (
        <NativeAction
          label="Stop sharing busy times"
          disabled={view.busy || view.stage !== "ready"}
          onPress={() => confirmStop(runtime)}
        />
      )}
    </Card>
  );
}
function confirmStop(runtime: CalendarRuntime) {
  Alert.alert(
    "Stop sharing busy times?",
    "Published busy times are removed when the server confirms. If you are offline, retry online; previously published times expire within 15 minutes.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Stop sharing",
        style: "destructive",
        onPress: () => {
          void runtime.change([], false);
        },
      },
    ],
  );
}
function CalendarPermission({ runtime, enabled }: { runtime: CalendarRuntime; enabled: boolean }) {
  return (
    <Card>
      <Section title="Calendar access" />
      <Note>
        Allow read access to choose calendars. Declining does not block other Nest features.
      </Note>
      <NativeAction
        label="Allow calendar access"
        disabled={!enabled}
        onPress={() => {
          void runtime.requestPermission();
        }}
      />
      <NativeAction
        label="Open iPhone settings"
        onPress={() => {
          void Linking.openSettings().catch(() =>
            Alert.alert(
              "Could not open Settings",
              "Open the iPhone Settings app to manage Nest’s calendar access.",
            ),
          );
        }}
      />
    </Card>
  );
}

function Recovery({
  runtime,
  view,
  verify,
}: {
  runtime: CalendarRuntime;
  view: CalendarView;
  verify: () => void;
}) {
  if (view.stage === "uncertain")
    return (
      <>
        <NativeAction
          label="Retry saved sharing change"
          disabled={view.busy}
          onPress={() => {
            void runtime.retry().then(() => runtime.refresh());
          }}
        />
        <NativeAction
          label="Reload sharing status"
          disabled={view.busy}
          onPress={() => {
            void runtime.load();
          }}
        />
      </>
    );
  if (view.stage === "verify") return <NativeAction label="Verify account" onPress={verify} />;
  if (view.stage === "reload")
    return (
      <NativeAction
        label="Reload sharing settings"
        disabled={view.busy}
        onPress={() => {
          void runtime.load();
        }}
      />
    );
  return null;
}

function PublishingDevice({ view }: { view: CalendarView }) {
  return view.consent?.enabled && view.selection?.status !== "active" ? (
    <Note>
      This iPhone has no confirmed selection for the current sharing settings. Another device may be
      publishing.
    </Note>
  ) : null;
}
