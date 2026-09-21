import { FlatList, useColorScheme } from "react-native";
import { Host, Switch } from "@expo/ui";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { space, useQuiet } from "../theme";
import type { AgendaRuntime, AgendaView } from "./agenda-runtime";
export function AgendaCalendarPicker({
  runtime,
  view,
  close,
}: {
  runtime: AgendaRuntime;
  view: AgendaView;
  close: () => void;
}) {
  const colors = useQuiet(),
    scheme = useColorScheme();
  const selected = view.selection?.calendarIds ?? [];
  const missing = selected.filter((id) => !view.calendars.some((calendar) => calendar.id === id));
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, paddingBottom: 48, gap: space.medium }}
      data={view.calendars}
      keyExtractor={(calendar) => calendar.id}
      ListHeaderComponent={
        <Section title="Calendars on this iPhone">
          <Note>Each switch saves your display choice. Busy sharing is configured separately.</Note>
          {view.notice ? <Note>{view.notice}</Note> : null}
          {view.busy ? <Note>Saving or reading…</Note> : null}
          {missing.length ? (
            <>
              <Note>{missing.length} selected calendars are no longer available.</Note>
              <NativeAction
                label="Remove unavailable selections"
                disabled={view.busy}
                onPress={() => {
                  void runtime.changeSelection(selected.filter((id) => !missing.includes(id)));
                }}
              />
            </>
          ) : null}
          <NativeAction label="Back to agenda" disabled={view.busy} onPress={close} />
        </Section>
      }
      ListEmptyComponent={
        <Note>
          {view.permission
            ? "No calendars are available on this iPhone."
            : "Calendar access is off. Return to the agenda to enable it."}
        </Note>
      }
      renderItem={({ item }) => (
        <Host
          matchContents
          colorScheme={scheme === "dark" ? "dark" : "light"}
          seedColor={colors.accent}
        >
          <Switch
            label={item.title || "Untitled calendar"}
            value={selected.includes(item.id)}
            disabled={view.busy || !view.permission}
            onValueChange={(value) => {
              void runtime.changeSelection(
                value ? [...selected, item.id] : selected.filter((id) => id !== item.id),
              );
            }}
          />
        </Host>
      )}
    />
  );
}
