import { useNativeState } from "@expo/ui";
import { useState } from "react";
import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import * as Crypto from "expo-crypto";
import * as Schema from "effect/Schema";
import type { Grocery } from "@nest/contracts/groceries";
import { GroceryChange } from "./edit-contract";
export function useGroceryDraft(
  item: Grocery | null,
  working: boolean,
  save: (change: GroceryChange) => void,
) {
  const initial = draftValues(item);
  const [identity] = useState(() => ({
    operationId: Crypto.randomUUID(),
    itemId: item?.itemId ?? Crypto.randomUUID(),
  }));
  const name = useNativeState(initial.name),
    quantity = useNativeState(initial.quantity),
    unit = useNativeState(initial.unit);
  const [category, setCategory] = useState(initial.category);
  const [error, setError] = useState<string | null>(null);
  const original = [initial.name, initial.quantity, initial.unit, initial.category];
  useLeaveGrocery(
    () =>
      [name.value, quantity.value, unit.value, category].some(
        (value, index) => value !== original[index],
      ) || working,
  );
  const submit = () => {
    const fields = {
      name: name.value.trim(),
      quantity: quantity.value.trim() || null,
      unit: unit.value.trim() || null,
      categoryId: category || null,
    };
    const change = item
      ? { action: "edit", command: { ...identity, ...fields, expectedVersion: item.version } }
      : { action: "add", command: { ...identity, ...fields } };
    const decoded = Schema.decodeUnknownExit(GroceryChange)(change);
    if (decoded._tag === "Failure")
      return setError(
        "Add a name (up to 120 characters). Quantity and unit can each have up to 80 characters.",
      );
    setError(null);
    save(decoded.value);
  };
  return { name, quantity, unit, category, setCategory, error, submit };
}
export function useLeaveGrocery(dirty: () => boolean) {
  const navigation = useNavigation();
  usePreventRemove(true, ({ data }) => {
    if (!dirty()) return navigation.dispatch(data.action);
    Alert.alert(
      "Leave this form?",
      "Unsaved input will be lost. Any attempt already sent is kept for an explicit retry.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
}

function draftValues(item: Grocery | null) {
  return {
    name: item?.name ?? "",
    quantity: item?.quantity ?? "",
    unit: item?.unit ?? "",
    category: item?.categoryId ?? "",
  };
}
