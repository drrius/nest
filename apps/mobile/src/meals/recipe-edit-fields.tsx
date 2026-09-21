import { Fragment, type ComponentProps } from "react";
import { Host, Column, Text, TextInput, useNativeState } from "@expo/ui";
import { useColorScheme } from "react-native";
import type { SavedMeal } from "@nest/contracts/meal-library";
import { metadataFields } from "./recipe-edit-draft";
import { useQuiet } from "../theme";
type Field = {
  key: string;
  label: string;
  value: NonNullable<ComponentProps<typeof TextInput>["value"]>;
  initial: string;
  limit: number;
  multiline?: boolean;
  keyboardType?: ComponentProps<typeof TextInput>["keyboardType"];
  placeholder?: string;
};
export function RecipeTextFields({
  fields,
  editable = true,
}: {
  fields: Field[];
  editable?: boolean;
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
        {fields.map((field) => (
          <Fragment key={field.key}>
            <Text>{field.label}</Text>
            <TextInput
              value={field.value}
              editable={editable}
              maxLength={Math.max(field.limit, field.initial.length)}
              multiline={field.multiline}
              keyboardType={field.keyboardType}
              placeholder={field.placeholder}
              autoCapitalize={field.keyboardType === "url" ? "none" : "sentences"}
              autoCorrect={field.keyboardType !== "url"}
            />
          </Fragment>
        ))}
      </Column>
    </Host>
  );
}
export function useRecipeEditFields(recipe: SavedMeal) {
  const initial = metadataFields(recipe);
  const title = useNativeState(initial.title),
    servings = useNativeState(initial.servings),
    instructions = useNativeState(initial.instructions),
    notes = useNativeState(initial.notes),
    recipeUrl = useNativeState(initial.recipeUrl);
  const read = () => ({
    title: title.value,
    servings: servings.value,
    instructions: instructions.value,
    notes: notes.value,
    recipeUrl: recipeUrl.value,
  });
  return {
    title,
    servings,
    instructions,
    notes,
    recipeUrl,
    initial,
    read,
    dirty: () =>
      Object.entries(read()).some(([key, value]) => value !== initial[key as keyof typeof initial]),
  };
}
export function RecipeEditFields({
  fields,
  editable,
}: {
  fields: ReturnType<typeof useRecipeEditFields>;
  editable: boolean;
}) {
  const initial = fields.initial;
  return (
    <RecipeTextFields
      editable={editable}
      fields={[
        {
          key: "title",
          label: "Recipe name",
          value: fields.title,
          initial: initial.title,
          limit: 120,
        },
        {
          key: "servings",
          label: "Servings",
          value: fields.servings,
          initial: initial.servings,
          limit: 10,
          keyboardType: "number-pad",
          placeholder: "Unknown",
        },
        {
          key: "instructions",
          label: "Cooking instructions",
          value: fields.instructions,
          initial: initial.instructions,
          limit: 4000,
          multiline: true,
          placeholder: "Unknown · add instructions if known",
        },
        {
          key: "notes",
          label: "Notes · optional",
          value: fields.notes,
          initial: initial.notes,
          limit: 4000,
          multiline: true,
        },
        {
          key: "recipeUrl",
          label: "Source link · optional",
          value: fields.recipeUrl,
          initial: initial.recipeUrl,
          limit: 2000,
          keyboardType: "url",
          placeholder: "https://",
        },
      ]}
    />
  );
}
