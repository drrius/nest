import { Host, Column, Text, TextInput, Picker } from "@expo/ui";
import { useColorScheme } from "react-native";
import { useQuiet } from "../theme";
import type { FoodRuntime, FoodView } from "../food/runtime";
import { useFoodDraft } from "../food/use-draft";
import { Card, Note, Section } from "./page";
import { NativeAction } from "./native-action";
const portions = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4] as const;
export function FoodFields({ runtime, view }: { runtime: FoodRuntime; view: FoodView }) {
  const colors = useQuiet(),
    scheme = useColorScheme();
  const draft = useFoodDraft(runtime, view);
  const editable = !view.busy && view.stage === "form";
  return (
    <Card>
      <Section title="Your food preferences" />
      {!view.profile ? (
        <Note>
          You have not saved your food preferences yet. Empty lists confirm that you have no
          restrictions or dislikes to add.
        </Note>
      ) : null}
      <Note>
        Dietary preferences will be used to plan household meals. Your calorie goal stays private.
        It is optional and guides estimates, not tracking.
      </Note>
      <Host
        matchContents
        colorScheme={scheme === "dark" ? "dark" : "light"}
        seedColor={colors.accent}
      >
        <Column spacing={12}>
          <Text>Restrictions · one per line</Text>
          <TextInput
            value={draft.restrictions}
            placeholder="Restrictions · one per line"
            multiline
            maxLength={3871}
            editable={editable}
          />
          <Text>Dislikes · one per line</Text>
          <TextInput
            value={draft.dislikes}
            placeholder="Dislikes · one per line"
            multiline
            maxLength={3871}
            editable={editable}
          />
          <Text>Daily calorie goal (optional)</Text>
          <TextInput
            value={draft.calorieGoal}
            placeholder="No calorie goal"
            keyboardType="number-pad"
            maxLength={5}
            editable={editable}
          />
          <Text>Your portions per meal</Text>
          <Picker
            selectedValue={draft.portions}
            onValueChange={draft.setPortions}
            enabled={editable}
          >
            {portions.map((value) => (
              <Picker.Item key={value} label={String(value)} value={value} />
            ))}
          </Picker>
        </Column>
      </Host>
      {draft.error ? <Note>{draft.error}</Note> : null}
      <NativeAction
        label={view.busy ? "Working…" : "Save online"}
        disabled={!editable}
        onPress={draft.submit}
      />
    </Card>
  );
}
