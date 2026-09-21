import { useState } from "react";
import { useNativeState } from "@expo/ui";
import { Alert } from "react-native";
import { ingredientFields, keepIngredient, type EditorIngredient } from "./recipe-edit-draft";
import { RecipeTextFields } from "./recipe-edit-fields";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
export function RecipeEditIngredient({
  item,
  onSave,
  onCancel,
}: {
  item: EditorIngredient;
  onSave: (item: EditorIngredient) => void;
  onCancel: () => void;
}) {
  const initial = ingredientFields(item);
  const name = useNativeState(initial.name),
    quantity = useNativeState(initial.quantity),
    unit = useNativeState(initial.unit),
    note = useNativeState(initial.note);
  const [error, setError] = useState(false);
  const save = () => {
    try {
      onSave(
        keepIngredient(item, {
          name: name.value,
          quantity: quantity.value,
          unit: unit.value,
          note: note.value,
        }),
      );
    } catch {
      setError(true);
    }
  };
  return (
    <Card>
      <Section title="Ingredient" />
      <RecipeTextFields
        fields={[
          { key: "name", label: "Name", value: name, initial: initial.name, limit: 120 },
          {
            key: "quantity",
            label: "Quantity · optional",
            value: quantity,
            initial: initial.quantity,
            limit: 80,
            placeholder: "1/2",
          },
          {
            key: "unit",
            label: "Unit · optional",
            value: unit,
            initial: initial.unit,
            limit: 80,
            placeholder: "cup",
          },
          {
            key: "note",
            label: "Note · optional",
            value: note,
            initial: initial.note,
            limit: 1000,
            multiline: true,
          },
        ]}
      />
      {error ? (
        <Note>Check the changed field lengths and values. An ingredient name is required.</Note>
      ) : null}
      <NativeAction label="Keep ingredient changes" onPress={save} />
      <NativeAction
        label="Cancel ingredient changes"
        onPress={() =>
          Alert.alert("Discard ingredient changes?", "Your other recipe changes will stay.", [
            { text: "Keep editing", style: "cancel" },
            { text: "Discard", style: "destructive", onPress: onCancel },
          ])
        }
      />
    </Card>
  );
}
export function RecipeEditIngredientRow({
  item,
  index,
  count,
  disabled,
  edit,
  remove,
  move,
}: {
  item: EditorIngredient;
  index: number;
  count: number;
  disabled: boolean;
  edit: () => void;
  remove: () => void;
  move: (delta: number) => void;
}) {
  return (
    <Card>
      <Note>
        {index + 1}. {item.name} ·{" "}
        {[item.quantity, item.unit].filter(Boolean).join(" ") || "Quantity not set"}
      </Note>
      {item.note ? <Note>{item.note}</Note> : null}
      <NativeAction label={`Edit ${item.name}`} disabled={disabled} onPress={edit} />
      <NativeAction
        label={`Move ${item.name} up`}
        disabled={disabled || index === 0}
        onPress={() => move(-1)}
      />
      <NativeAction
        label={`Move ${item.name} down`}
        disabled={disabled || index === count - 1}
        onPress={() => move(1)}
      />
      <NativeAction
        label={`Remove ${item.name}`}
        disabled={disabled}
        onPress={() =>
          Alert.alert(
            "Remove ingredient from this recipe?",
            "It will be archived when you save. Existing planned meals and groceries are kept.",
            [
              { text: "Keep", style: "cancel" },
              { text: "Remove", style: "destructive", onPress: remove },
            ],
          )
        }
      />
    </Card>
  );
}
