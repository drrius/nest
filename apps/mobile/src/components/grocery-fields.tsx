import { useGroceryDraft } from "../groceries/use-draft";
import { Host, Column, Text, TextInput, Picker } from "@expo/ui";
import type { Grocery, GroceryCategory } from "@nest/contracts/groceries";
import { Alert, useColorScheme } from "react-native";
import * as Crypto from "expo-crypto";
import { GroceryChange } from "../groceries/edit-contract";
import { useQuiet } from "../theme";
import { Card, Note, Section } from "./page";
import { NativeAction } from "./native-action";
export function GroceryFields({
  item,
  categories,
  working,
  save,
}: {
  item: Grocery | null;
  categories: readonly (typeof GroceryCategory.Type)[];
  working: boolean;
  save: (change: GroceryChange) => void;
}) {
  const colors = useQuiet(),
    scheme = useColorScheme();
  const { name, quantity, unit, category, setCategory, error, submit } = useGroceryDraft(
    item,
    working,
    save,
  );
  return (
    <Card>
      <Section title={item ? "Edit grocery" : "Add grocery"} />
      <Host
        matchContents
        colorScheme={scheme === "dark" ? "dark" : "light"}
        seedColor={colors.accent}
      >
        <Column spacing={12}>
          <Text>Name</Text>
          <TextInput value={name} placeholder="Name" maxLength={120} editable={!working} />
          <Text>Quantity (optional)</Text>
          <TextInput
            value={quantity}
            placeholder="Quantity (optional)"
            maxLength={80}
            editable={!working}
          />
          <Text>Unit (optional)</Text>
          <TextInput
            value={unit}
            placeholder="Unit (optional)"
            maxLength={80}
            editable={!working}
          />
          <Text>Category</Text>
          <Picker selectedValue={category} onValueChange={setCategory} enabled={!working}>
            <Picker.Item label="No category" value="" />
            {category && !categories.some((row) => row.categoryId === category) ? (
              <Picker.Item label="Existing category" value={category} />
            ) : null}
            {categories.map((row) => (
              <Picker.Item key={row.categoryId} label={row.name} value={row.categoryId} />
            ))}
          </Picker>
        </Column>
      </Host>
      {error ? <Note>{error}</Note> : null}
      <NativeAction
        label={item ? "Save online" : "Add online"}
        disabled={working}
        onPress={submit}
      />
      {item ? <RemoveGrocery item={item} working={working} save={save} /> : null}
    </Card>
  );
}
function RemoveGrocery({
  item,
  working,
  save,
}: {
  item: Grocery;
  working: boolean;
  save: (change: GroceryChange) => void;
}) {
  if (item.legacyClaimed)
    return (
      <Note>
        This item belongs to an existing shopping session. Removal needs that session reconciled
        first.
      </Note>
    );
  return (
    <NativeAction
      label="Remove grocery"
      disabled={working}
      onPress={() =>
        Alert.alert("Remove this grocery?", item.name, [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () =>
              save({
                action: "remove",
                label: item.name,
                command: {
                  operationId: Crypto.randomUUID(),
                  itemId: item.itemId,
                  expectedVersion: item.version,
                },
              }),
          },
        ])
      }
    />
  );
}
