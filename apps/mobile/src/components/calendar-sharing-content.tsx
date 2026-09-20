import { CalendarSharingHeader } from "./calendar-sharing-header";
import { useState } from "react";
import { Alert, FlatList } from "react-native";
import { Host, Switch } from "@expo/ui";
import { usePreventRemove } from "expo-router/react-navigation";
import { useNavigation } from "expo-router";
import type { CalendarRuntime, CalendarView } from "../calendar/runtime";
import { Page, Card, Note } from "./page";
import { NativeAction } from "./native-action";
import { useQuiet } from "../theme";
export function CalendarSharingContent({
  runtime,
  view,
  verify,
}: {
  runtime: CalendarRuntime;
  view: CalendarView;
  verify: () => void;
}) {
  const original = view.selection?.status === "active" ? view.selection.calendarIds : [];
  const [ids, setIds] = useState<readonly string[]>(original);
  const dirty = ids.length !== original.length || ids.some((id) => !original.includes(id));
  const navigation = useNavigation(),
    colors = useQuiet();
  usePreventRemove(dirty, ({ data }) =>
    Alert.alert(
      "Leave calendar choices?",
      "Your unsaved selection will be discarded. Existing sharing is unchanged.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => navigation.dispatch(data.action) },
      ],
    ),
  );
  if (!view.loaded)
    return (
      <Page>
        <Note>{view.notice ?? "Loading calendar sharing…"}</Note>
        <NativeAction
          label={view.stage === "verify" ? "Verify account" : "Retry loading"}
          disabled={view.busy}
          onPress={
            view.stage === "verify"
              ? verify
              : () => {
                  void runtime.load();
                }
          }
        />
      </Page>
    );
  const enabled = !view.busy && view.stage === "ready";
  return (
    <FlatList
      data={view.calendars}
      keyExtractor={(calendar) => calendar.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 20, gap: 12 }}
      style={{ backgroundColor: colors.background }}
      ListHeaderComponent={
        <CalendarSharingHeader runtime={runtime} view={view} verify={verify} ids={ids} />
      }
      ListEmptyComponent={
        view.permission ? <Note>No calendars are available on this iPhone.</Note> : null
      }
      renderItem={({ item }) => (
        <Card>
          <Host matchContents>
            <Switch
              label={item.title}
              value={ids.includes(item.id)}
              disabled={!enabled}
              onValueChange={(selected) =>
                setIds((current) =>
                  selected ? [...current, item.id] : current.filter((id) => id !== item.id),
                )
              }
            />
          </Host>
        </Card>
      )}
    />
  );
}
