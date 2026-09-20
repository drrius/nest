import { Checkbox, Host } from "@expo/ui";
import { ActivityIndicator, Alert, FlatList, useColorScheme } from "react-native";
import { Link } from "expo-router";
import type { Grocery } from "@nest/contracts/groceries";
import type { GroceryView } from "../groceries/runtime";
import { space, useQuiet } from "../theme";
import { Card, Note, Section } from "./page";
import { NativeAction } from "./native-action";

export function GroceryConflicts({
  view,
  discard,
}: {
  view: GroceryView;
  discard: (operation: string) => void;
}) {
  const conflicts = view.data?.pending.filter((row) => row.status === "conflict") ?? [];
  return (
    <>
      {conflicts.map((operation) => (
        <Card key={operation.operation}>
          <Note>
            {view.data?.groceries.find((item) => item.itemId === operation.target)?.name ??
              "A saved grocery"}{" "}
            changed before your check could be saved. Review the current item before retrying.
          </Note>
          <NativeAction
            label="Keep current item"
            onPress={() =>
              Alert.alert(
                "Keep the current item?",
                "Discard this failed check and any later checks that depended on it. The shared item will not change.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Keep current item", onPress: () => discard(operation.operation) },
                ],
              )
            }
          />
        </Card>
      ))}
    </>
  );
}
export function GroceryList({
  view,
  refresh,
  check,
  discard,
}: {
  view: GroceryView;
  refresh: () => void;
  check: (item: Grocery, checked: boolean) => void;
  discard: (operation: string) => void;
}) {
  const colors = useQuiet();
  const dark = useColorScheme() === "dark";
  return (
    <FlatList
      data={view.data?.groceries ?? []}
      keyExtractor={(item) => item.itemId}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      ListHeaderComponent={
        <>
          <Section title="For the next shop" />
          <GroceryStatus view={view} />
          <NativeAction label="Refresh and retry saved checks" onPress={refresh} />
          <GroceryConflicts view={view} discard={discard} />
        </>
      }
      ListEmptyComponent={
        <Note>
          {view.data?.loaded
            ? "Your grocery checklist is empty."
            : "Your groceries have not loaded yet."}
        </Note>
      }
      ListFooterComponent={
        <>
          <Note>Checking an item never records an expense.</Note>
          <Link
            href="/household"
            style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}
          >
            Back to Today
          </Link>
        </>
      }
      renderItem={({ item }) => (
        <Card>
          <Host matchContents colorScheme={dark ? "dark" : "light"} seedColor={colors.accent}>
            <Checkbox
              value={item.checked}
              label={[item.name, item.quantity, item.unit].filter(Boolean).join(" · ")}
              disabled={item.conflict}
              onValueChange={(checked) => check(item, checked)}
            />
          </Host>
          {item.pending ? <Note>{item.conflict ? "Needs review" : "Awaiting sync"}</Note> : null}
        </Card>
      )}
    />
  );
}

function GroceryStatus({ view }: { view: GroceryView }) {
  return (
    <>
      {view.syncing ? <ActivityIndicator accessibilityLabel="Syncing groceries" /> : null}
      {view.error ? <Note>{view.error}</Note> : null}
      {view.stale && view.data?.loaded ? (
        <Note>Showing saved groceries. Reconnect and refresh to sync your checks.</Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
    </>
  );
}
