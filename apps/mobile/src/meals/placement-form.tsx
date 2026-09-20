import { Host, Column, Text, TextInput, useNativeState } from "@expo/ui";
import { Alert, useColorScheme } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Card, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useQuiet } from "../theme";
import type { MealPlacementRuntime, PlacementView } from "./placement-runtime";
export function MealPlacementForm({
  runtime,
  view,
}: {
  runtime: MealPlacementRuntime;
  view: PlacementView;
}) {
  const title = useNativeState("");
  const colors = useQuiet(),
    scheme = useColorScheme(),
    navigation = useNavigation();
  const occupied = view.snapshot?.entries.find(
    (entry) => entry.date === runtime.target.date && entry.slot === runtime.target.slot,
  );
  const editable = !view.busy && view.stage === "ready" && !!view.snapshot && !occupied;
  usePreventRemove(true, ({ data }) => {
    if (view.receipt || (!title.value && !view.pendingWrite))
      return navigation.dispatch(data.action);
    Alert.alert(
      "Leave this meal?",
      "Your draft and retry details will be lost. A meal already sent may still be added. Check the week before adding it again.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
  if (view.stage === "verify") return null;
  return (
    <Card>
      <Note>
        {runtime.target.date} · {runtime.target.slot}
      </Note>
      {occupied ? <Note>Current meal: {occupied.title}</Note> : null}
      {view.receipt ? (
        <Note>
          The placement was confirmed. The current week may reflect later changes by your partner.
        </Note>
      ) : (
        <Note>
          Add a one-off meal online. Your title stays here if saving fails. Groceries are added
          separately.
        </Note>
      )}
      <Host
        matchContents
        colorScheme={scheme === "dark" ? "dark" : "light"}
        seedColor={colors.accent}
      >
        <Column spacing={12}>
          <Text>Meal title</Text>
          <TextInput
            value={title}
            placeholder="What would you like to eat?"
            maxLength={120}
            editable={editable}
          />
        </Column>
      </Host>
      {!view.receipt ? (
        <NativeAction
          label="Add meal online"
          disabled={!editable}
          onPress={() => {
            void runtime.save(title.value);
          }}
        />
      ) : null}
    </Card>
  );
}
