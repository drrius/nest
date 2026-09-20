import { Host, Column, Text, TextInput, useNativeState } from "@expo/ui";
import { Alert, useColorScheme } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Card, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useQuiet } from "../theme";
import type { MealReplacementRuntime, ReplacementView } from "./replacement-runtime";
export function MealReplacementForm({
  runtime,
  view,
}: {
  runtime: MealReplacementRuntime;
  view: ReplacementView;
}) {
  const title = useNativeState("");
  const colors = useQuiet(),
    scheme = useColorScheme(),
    navigation = useNavigation();
  const occupied = view.snapshot?.entries.find(
    (entry) => entry.date === runtime.target.date && entry.slot === runtime.target.slot,
  );
  const editable = canEdit(view, occupied?.entryId, runtime.target.entryId);
  usePreventRemove(true, ({ data }) => {
    if (view.receipt || (!title.value && !view.pendingWrite))
      return navigation.dispatch(data.action);
    Alert.alert(
      "Leave this meal?",
      "Your draft and retry details will be lost. A meal already sent may still replace the original. Check the week before trying again.",
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
      <ReplacementNotice view={view} matches={occupied?.entryId === runtime.target.entryId} />
      <Host
        matchContents
        colorScheme={scheme === "dark" ? "dark" : "light"}
        seedColor={colors.accent}
      >
        <Column spacing={12}>
          <Text>New meal title</Text>
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
          label="Replace meal online"
          disabled={!editable}
          onPress={() => {
            void runtime.save(title.value);
          }}
        />
      ) : null}
    </Card>
  );
}

function canEdit(view: ReplacementView, entry: string | undefined, expected: string) {
  return !view.busy && view.stage === "ready" && entry === expected;
}

function ReplacementNotice({ view, matches }: { view: ReplacementView; matches: boolean }) {
  if (view.receipt)
    return (
      <Note>
        The replacement was confirmed. The current week may reflect later changes by your partner.
      </Note>
    );
  if (view.snapshot && !matches)
    return (
      <Note>
        The original meal is no longer in this slot. Return to the week and choose the current meal
        before making another change.
      </Note>
    );
  return (
    <Note>
      Replace this meal with a new one-off meal online. The original history and groceries stay
      saved. Open linked preparation is skipped; the new meal has no preparation scheduled. Your
      title stays here if saving fails.
    </Note>
  );
}
