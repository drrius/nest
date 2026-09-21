import { useState } from "react";
import { Alert, useColorScheme } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Host, Column, Text, TextInput, useNativeState } from "@expo/ui";
import * as Schema from "effect/Schema";
import type { MealIngredient } from "@nest/contracts/meal-ingredients";
import { IngredientChoice } from "./ingredient-draft";
import type { IngredientRuntime } from "./ingredient-runtime";
import { Page, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useQuiet } from "../theme";
export function IngredientQuantityEditor({
  source,
  choice,
  sequence,
  runtime,
  close,
}: {
  source: MealIngredient;
  choice: typeof IngredientChoice.Type;
  sequence: number;
  runtime: IngredientRuntime;
  close: () => void;
}) {
  const { quantity, unit, error, saving, save, leave } = useQuantityDraft({
    choice,
    sequence,
    runtime,
    close,
  });
  const colors = useQuiet(),
    scheme = useColorScheme();
  return (
    <Page>
      <Section title={source.name}>
        <Note>
          {source.mealTitle} · {source.date}
        </Note>
      </Section>
      <Note>
        Keep the recipe’s quantity and unit as written, or change them for what you need. Nothing is
        converted or combined.
      </Note>
      <Host
        matchContents
        colorScheme={scheme === "dark" ? "dark" : "light"}
        seedColor={colors.accent}
      >
        <Column spacing={12}>
          <Text>Quantity · optional</Text>
          <TextInput value={quantity} maxLength={160} placeholder="Unknown" editable={!saving} />
          <Text>Unit · optional</Text>
          <TextInput value={unit} maxLength={160} placeholder="Not specified" editable={!saving} />
        </Column>
      </Host>
      {error ? <Note>{error}</Note> : null}
      <NativeAction
        label={saving ? "Saving quantity…" : "Keep quantity edits"}
        disabled={saving}
        onPress={() => {
          void save();
        }}
      />
      <NativeAction label="Back to ingredients" disabled={saving} onPress={() => leave(close)} />
    </Page>
  );
}
function value(text: string, previous: string | null) {
  if (text === (previous ?? "")) return previous;
  return text === "" ? null : text;
}

function useQuantityDraft({
  choice,
  sequence,
  runtime,
  close,
}: {
  choice: typeof IngredientChoice.Type;
  sequence: number;
  runtime: IngredientRuntime;
  close: () => void;
}) {
  const quantity = useNativeState(choice.quantity ?? ""),
    unit = useNativeState(choice.unit ?? "");
  const [error, setError] = useState<string | null>(null),
    [saving, setSaving] = useState(false);
  const navigation = useNavigation();
  const dirty = () =>
    quantity.value !== (choice.quantity ?? "") || unit.value !== (choice.unit ?? "");
  const leave = (done: () => void) => {
    if (saving) return;
    if (!dirty()) {
      done();
      return;
    }
    Alert.alert(
      "Discard quantity edits?",
      "Your saved selections will stay. These unsaved quantity and unit edits will be lost.",
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard edits", style: "destructive", onPress: done },
      ],
    );
  };
  usePreventRemove(true, ({ data }) => leave(() => navigation.dispatch(data.action)));
  const save = async () => {
    if (saving) return;
    const next = {
      ...choice,
      quantity: value(quantity.value, choice.quantity),
      unit: value(unit.value, choice.unit),
    };
    if (!Schema.is(IngredientChoice)(next)) {
      setError("Keep each field within 80 characters and remove unsupported characters.");
      return;
    }
    setSaving(true);
    setError(null);
    const saved = await runtime.edit(next, sequence);
    setSaving(false);
    if (saved) close();
    else
      setError(
        "Could not save these edits. Keep them here, or go back and refresh the ingredient review.",
      );
  };
  return { quantity, unit, error, saving, save, leave };
}
