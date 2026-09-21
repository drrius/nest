import { useState, useSyncExternalStore } from "react";
import { FlatList, Text } from "react-native";
import { Note, Page, Card } from "../components/page";
import { NativeAction } from "../components/native-action";
import { space, useQuiet } from "../theme";
import type { AgendaRow } from "./agenda";
import type { AgendaRuntime } from "./agenda-runtime";
import { AgendaControls } from "./agenda-controls";
import { AgendaCalendarPicker } from "./agenda-calendar-picker";
export function AgendaContent({ runtime, verify }: { runtime: AgendaRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    colors = useQuiet();
  const [choosing, setChoosing] = useState(false);
  if (!view.active)
    return (
      <Page>
        <Note>Open Calendar to read your agenda.</Note>
      </Page>
    );
  if (!view.access)
    return (
      <Page>
        <Note>{view.notice}</Note>
        <NativeAction label="Verify account" onPress={verify} />
      </Page>
    );
  if (choosing)
    return <AgendaCalendarPicker runtime={runtime} view={view} close={() => setChoosing(false)} />;
  const rows = view.result?.status === "ready" ? view.result.rows : [];
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, paddingBottom: 48, gap: space.medium }}
      data={rows}
      keyExtractor={(row) => row.key}
      ListHeaderComponent={
        <AgendaControls runtime={runtime} view={view} choose={() => setChoosing(true)} />
      }
      ListEmptyComponent={
        view.result?.status === "ready" ? (
          <Note>
            {view.selection?.calendarIds.length
              ? "No events in your selected calendars for this day."
              : "Choose the calendars you want to see here."}
          </Note>
        ) : null
      }
      renderItem={({ item }) => (
        <PersonalEvent
          row={item}
          calendar={
            view.calendars.find((calendar) => calendar.id === item.calendarId)?.title ??
            "Your calendar"
          }
        />
      )}
    />
  );
}
function PersonalEvent({ row, calendar }: { row: AgendaRow; calendar: string }) {
  const colors = useQuiet();
  const format = (instant: number) =>
    new Date(instant).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <Card>
      <Text selectable style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>
        {row.title || "Untitled event"}
      </Text>
      <Note>{calendar} · Personal details on this iPhone</Note>
      <Note>
        {row.allDay ? "All day · " : ""}
        {format(row.start)} — {format(row.end)}
      </Note>
      {row.location ? <Note>{row.location}</Note> : null}
      {row.notes ? <Note>{row.notes}</Note> : null}
    </Card>
  );
}
