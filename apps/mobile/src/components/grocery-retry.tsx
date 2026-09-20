import type { GroceryCategory } from "@nest/contracts/groceries";
import { groceryChangeSummary } from "../groceries/change-summary";
import { Alert } from "react-native";
import type { GroceryChange } from "../groceries/edit-contract";
import { Card, Note, Section } from "./page";
import { NativeAction } from "./native-action";
export function GroceryRetry({
  change,
  retry,
  discard,
  working,
  categories,
}: {
  change: GroceryChange;
  retry: () => void;
  discard: () => void;
  working: boolean;
  categories: readonly (typeof GroceryCategory.Type)[];
}) {
  const summary = groceryChangeSummary(change, categories);
  return (
    <Card>
      <Section title="Finish your previous save" />
      <Note>{summary.title}</Note>
      {summary.details.map((detail) => (
        <Note key={detail}>{detail}</Note>
      ))}
      <Note>
        The server may already have saved this attempt. Retrying sends the same details once. It
        will not run automatically.
      </Note>
      <NativeAction label="Retry online" disabled={working} onPress={retry} />
      <NativeAction
        label="Discard retry after reviewing checklist"
        disabled={working}
        onPress={() =>
          Alert.alert(
            "Discard this retry?",
            "Check the shared checklist first. Discarding the retry does not undo a change already saved by the server.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Discard retry", style: "destructive", onPress: discard },
            ],
          )
        }
      />
    </Card>
  );
}
