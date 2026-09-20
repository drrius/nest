import { Host, Column, Text, TextInput, Switch } from "@expo/ui";
import { useColorScheme } from "react-native";
import { useQuiet } from "../theme";
import type { CookingRuntime, CookingView } from "../cooking/runtime";
import { useCookingDraft, mealSlots } from "../cooking/use-draft";
import { Card, Note, Section } from "./page";
import { NativeAction } from "./native-action";
const labels = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
export function CookingFields({ runtime, view }: { runtime: CookingRuntime; view: CookingView }) {
  const colors = useQuiet(),
    scheme = useColorScheme();
  const draft = useCookingDraft(runtime, view);
  const editable = !view.busy && view.stage === "form";
  return (
    <Card>
      <Section title="Household cooking" />
      <Note>
        These choices are shared with your partner. Keep personal dietary restrictions and calorie
        goals in your own food preferences.
      </Note>
      {!view.profile ? (
        <Note>
          Your household has not saved cooking preferences yet. Choose the meal slots you want to
          see when planning.
        </Note>
      ) : null}
      <Host
        matchContents
        colorScheme={scheme === "dark" ? "dark" : "light"}
        seedColor={colors.accent}
      >
        <Column spacing={12}>
          <Text>Cooking preferences (optional)</Text>
          <TextInput
            value={draft.notes}
            placeholder="What works for your kitchen?"
            multiline
            numberOfLines={4}
            maxLength={2000}
            editable={editable}
          />
          <Text>Visible meal slots</Text>
          {mealSlots.map((slot) => (
            <Switch
              key={slot}
              label={labels[slot]}
              value={draft.slots.includes(slot)}
              disabled={!editable}
              onValueChange={(checked) => draft.toggle(slot, checked)}
            />
          ))}
        </Column>
      </Host>
      {draft.error ? <Note>{draft.error}</Note> : null}
      <NativeAction
        label={view.busy ? "Working…" : "Save shared preferences"}
        disabled={!editable}
        onPress={draft.submit}
      />
    </Card>
  );
}
