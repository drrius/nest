import DateTimePicker from "@expo/ui/community/datetime-picker";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { NativeAction } from "../components/native-action";
import { QuietAction } from "../components/quiet-action";
import { ActionMenu } from "../components/action-menu";
import { Note } from "../components/page";
import { space } from "../theme";
import { adjacentDay, agendaDay, localDate } from "./agenda-day";
import type { AgendaRuntime, AgendaView } from "./agenda-runtime";
export function AgendaControls({
  runtime,
  view,
  choose,
}: {
  runtime: AgendaRuntime;
  view: AgendaView;
  choose: () => void;
}) {
  const router = useRouter();
  const move = (direction: -1 | 1) => {
    const date = adjacentDay(view.date, direction);
    if (date) router.setParams({ date });
  };
  return (
    <View style={{ gap: space.medium }}>
      <Note>Your day, with room for everything.</Note>
      <View
        style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.medium }}
      >
        <AgendaDate view={view} />
        <ActionMenu
          label="Calendar actions"
          actions={[
            {
              label: "Today",
              disabled: view.busy,
              onPress: () => router.setParams({ date: localDate(new Date()) }),
            },
            {
              label: "Choose calendars to show",
              disabled: view.busy || !view.permission,
              onPress: choose,
            },
            {
              label: "Refresh agenda",
              disabled: view.busy,
              onPress: () => {
                void runtime.refresh();
              },
            },
            { label: "Manage busy sharing", onPress: () => router.push("/calendar-sharing") },
          ]}
        />
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: space.medium,
        }}
      >
        <QuietAction
          label="‹ Previous day"
          disabled={view.busy || !adjacentDay(view.date, -1)}
          onPress={() => move(-1)}
        />
        <QuietAction
          label="Next day ›"
          disabled={view.busy || !adjacentDay(view.date, 1)}
          onPress={() => move(1)}
        />
      </View>
      <AgendaStatus runtime={runtime} view={view} />
    </View>
  );
}
function AgendaDate({ view }: { view: AgendaView }) {
  const router = useRouter();
  const window = agendaDay(view.date);
  if (process.env.EXPO_OS !== "ios" || !window) return <Note>{view.date}</Note>;
  return (
    <DateTimePicker
      style={{ flexGrow: 1, flexBasis: 200, minHeight: 44 }}
      value={new Date(window.start)}
      mode="date"
      disabled={view.busy}
      onChange={(_event, date) => {
        if (date) router.setParams({ date: localDate(date) });
      }}
    />
  );
}
function AgendaStatus({ runtime, view }: { runtime: AgendaRuntime; view: AgendaView }) {
  return (
    <>
      {view.busy ? <Note>Loading or saving…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.loaded && !view.permission ? (
        <>
          <Note>
            Allow calendar access to see your existing events. Other Nest features still work.
          </Note>
          <NativeAction
            label="Allow calendar access"
            disabled={view.busy}
            onPress={() => {
              void runtime.requestPermission();
            }}
          />
        </>
      ) : null}
      {view.result?.status === "unavailable" ? (
        <Note>
          {view.result.reason === "missing_calendar"
            ? "A selected calendar is no longer available. Choose calendars available on this iPhone."
            : "Could not read this agenda. Refresh after checking calendar access; an empty agenda is not confirmed."}
        </Note>
      ) : null}
      {view.notice ? (
        <QuietAction
          label="Retry agenda"
          disabled={view.busy}
          onPress={() => {
            void runtime.refresh();
          }}
        />
      ) : null}
    </>
  );
}
