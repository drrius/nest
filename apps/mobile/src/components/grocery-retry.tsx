import { Alert } from "react-native";
import type { GroceryChange } from "../groceries/edit-contract";
import { Card, Note, Section } from "./page";
import { NativeAction } from "./native-action";
export function GroceryRetry({
  change,
  retry,
  discard,
  working,
}: {
  change: GroceryChange;
  retry: () => void;
  discard: () => void;
  working: boolean;
}) {
  return (
    <Card>
      <Section title="Finish your previous save" />
      <Note>
        {change.action === "remove"
          ? "Remove grocery"
          : `${change.action === "add" ? "Add" : "Edit"}: ${change.command.name}`}
      </Note>
      {change.action !== "remove" ? (
        <Note>{[change.command.quantity, change.command.unit].filter(Boolean).join(" ")}</Note>
      ) : null}
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
