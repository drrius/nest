import { useState } from "react";
import { Host, Column, Text, TextInput, useNativeState } from "@expo/ui";
import { Alert, useColorScheme } from "react-native";
import * as Schema from "effect/Schema";
import { RecipeIngredientInput } from "@nest/contracts/recipe-creation";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useQuiet } from "../theme";
export type DraftIngredient = typeof RecipeIngredientInput.Type & { key: string };
export function RecipeIngredientEditor({
  item,
  onSave,
  onCancel,
}: {
  item: DraftIngredient;
  onSave: (item: DraftIngredient) => void;
  onCancel: () => void;
}) {
  const name = useNativeState(item.name),
    quantity = useNativeState(item.quantity ?? ""),
    unit = useNativeState(item.unit ?? ""),
    note = useNativeState(item.note ?? "");
  const [error, setError] = useState(false),
    colors = useQuiet(),
    scheme = useColorScheme();
  const save = () => {
    const result = Schema.decodeUnknownExit(RecipeIngredientInput)({
      name: name.value.trim(),
      quantity: quantity.value.trim() || null,
      unit: unit.value.trim() || null,
      note: note.value.trim() || null,
      categoryId: item.categoryId,
    });
    if (result._tag === "Failure") {
      setError(true);
      return;
    }
    onSave({ ...result.value, key: item.key });
  };
  return (
    <Card>
      <Section title="Ingredient" />
      <Host
        matchContents
        colorScheme={scheme === "dark" ? "dark" : "light"}
        seedColor={colors.accent}
      >
        <Column spacing={12}>
          <Text>Name</Text>
          <TextInput value={name} maxLength={120} placeholder="Tomatoes" />
          <Text>Quantity · optional</Text>
          <TextInput value={quantity} maxLength={80} placeholder="1/2" />
          <Text>Unit · optional</Text>
          <TextInput value={unit} maxLength={80} placeholder="cup" />
          <Text>Note · optional</Text>
          <TextInput value={note} maxLength={1000} multiline placeholder="Chopped" />
        </Column>
      </Host>
      {error ? <Note>Enter an ingredient name and check the field lengths.</Note> : null}
      <NativeAction label="Keep ingredient" onPress={save} />
      <NativeAction
        label="Cancel ingredient changes"
        onPress={() =>
          Alert.alert("Discard ingredient changes?", "Your other recipe fields will stay.", [
            { text: "Keep editing", style: "cancel" },
            { text: "Discard", style: "destructive", onPress: onCancel },
          ])
        }
      />
    </Card>
  );
}
