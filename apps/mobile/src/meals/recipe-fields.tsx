import { Host, Column, Text, TextInput, useNativeState } from "@expo/ui";
import { useColorScheme } from "react-native";
import { useQuiet } from "../theme";
export function useRecipeFields() {
  const title = useNativeState(""),
    servings = useNativeState("2"),
    instructions = useNativeState("");
  const notes = useNativeState(""),
    recipeUrl = useNativeState("");
  return {
    title,
    servings,
    instructions,
    notes,
    recipeUrl,
    dirty: () =>
      !!(
        title.value ||
        instructions.value ||
        notes.value ||
        recipeUrl.value ||
        servings.value !== "2"
      ),
    read: () => ({
      title: title.value.trim(),
      servings: /^[1-9][0-9]*$/.test(servings.value) ? Number(servings.value) : 0,
      instructions: instructions.value.trim(),
      notes: notes.value.trim() || null,
      recipeUrl: recipeUrl.value.trim() || null,
    }),
  };
}
export function RecipeFields({
  fields,
  editable,
}: {
  fields: ReturnType<typeof useRecipeFields>;
  editable: boolean;
}) {
  const colors = useQuiet(),
    scheme = useColorScheme();
  return (
    <Host
      matchContents
      colorScheme={scheme === "dark" ? "dark" : "light"}
      seedColor={colors.accent}
    >
      <Column spacing={12}>
        <Text>Recipe name</Text>
        <TextInput
          value={fields.title}
          editable={editable}
          maxLength={120}
          placeholder="Tomato soup"
        />
        <Text>Servings</Text>
        <TextInput
          value={fields.servings}
          editable={editable}
          maxLength={10}
          keyboardType="number-pad"
        />
        <Text>Cooking instructions</Text>
        <TextInput
          value={fields.instructions}
          editable={editable}
          maxLength={4000}
          multiline
          placeholder="How do you make it?"
        />
        <Text>Notes · optional</Text>
        <TextInput value={fields.notes} editable={editable} maxLength={4000} multiline />
        <Text>Source link · optional</Text>
        <TextInput
          value={fields.recipeUrl}
          editable={editable}
          maxLength={2000}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://"
        />
      </Column>
    </Host>
  );
}
