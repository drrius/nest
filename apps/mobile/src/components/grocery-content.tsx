import type { GroceryData } from "../groceries/flow";
import { Checkbox, Host } from "@expo/ui";
import { useState, type ReactNode, type PropsWithChildren } from "react";
import { checklistRows } from "../groceries/checklist-view";
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
type GroceryListProps = {
  add: ReactNode;
  view: GroceryView;
  refresh: () => void;
  check: (item: Grocery, checked: boolean) => void;
  discard: (operation: string) => void;
};
export function GroceryList({ view, refresh, check, discard, add }: GroceryListProps) {
  const [grouped, setGrouped] = useState(false);
  const [showChecked, setShowChecked] = useState(false);
  const items = view.data?.groceries ?? [];
  const hidden = items.filter((item) => item.checked && !item.pending && !item.conflict).length;
  const colors = useQuiet();
  return (
    <FlatList
      data={checklistRows(items, showChecked, grouped)}
      keyExtractor={(row) => row.key}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      ListHeaderComponent={
        <>
          <GroceryHeader view={view} add={add} refresh={refresh} discard={discard}>
            {grouped || items.some((item) => item.categoryName) ? (
              <NativeAction
                label={grouped ? "Show simple list" : "Group by category"}
                onPress={() => setGrouped((value) => !value)}
              />
            ) : null}
            {hidden > 0 ? (
              <NativeAction
                label={showChecked ? "Hide checked" : `Show checked (${hidden})`}
                onPress={() => setShowChecked((value) => !value)}
              />
            ) : null}
          </GroceryHeader>
        </>
      }
      ListEmptyComponent={<Note>{emptyMessage(view.data)}</Note>}
      ListFooterComponent={
        <>
          <Note>Checking an item never records an expense.</Note>
          <Link
            href="/household"
            dismissTo
            style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}
          >
            Back to Today
          </Link>
        </>
      }
      renderItem={({ item: row }) =>
        row.kind === "category" ? (
          <Section title={row.title} />
        ) : (
          <GroceryRow item={row.item} check={check} showCategory={!grouped} />
        )
      }
    />
  );
}

function GroceryHeader({
  view,
  add,
  refresh,
  discard,
  children,
}: PropsWithChildren<Omit<GroceryListProps, "check">>) {
  return (
    <>
      <Section title="For the next shop" />
      {add}
      <GroceryStatus view={view} />
      <NativeAction label="Refresh and retry saved checks" onPress={refresh} />
      <GroceryConflicts view={view} discard={discard} />
      {children}
    </>
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

function GroceryRow({
  item,
  check,
  showCategory,
}: {
  item: GroceryData["groceries"][number];
  showCategory: boolean;
  check: (item: Grocery, checked: boolean) => void;
}) {
  const colors = useQuiet();
  const dark = useColorScheme() === "dark";
  return (
    <Card>
      <Host matchContents colorScheme={dark ? "dark" : "light"} seedColor={colors.accent}>
        <Checkbox
          value={item.checked}
          label={[item.name, item.quantity, item.unit].filter(Boolean).join(" · ")}
          disabled={item.conflict}
          onValueChange={(checked) => check(item, checked)}
        />
      </Host>
      {showCategory && item.categoryName ? <Note>{item.categoryName}</Note> : null}
      {item.mealSource ? (
        <Note>
          From {item.mealSource.title}
          {item.mealSource.date ? ` · ${item.mealSource.date}` : ""}
          {item.mealSource.slot ? ` · ${item.mealSource.slot}` : ""}
        </Note>
      ) : null}
      {item.pending ? <Note>{item.conflict ? "Needs review" : "Awaiting sync"}</Note> : null}
      <GroceryReminderLink item={item} />
      {!item.pending ? (
        <Link
          href={{ pathname: "/grocery-edit", params: { itemId: item.itemId } }}
          style={{ color: colors.accent, fontSize: 17, paddingVertical: 8 }}
        >
          Edit {item.name}
        </Link>
      ) : null}
    </Card>
  );
}

function emptyMessage(data: GroceryData | null) {
  if (!data?.loaded) return "Your groceries have not loaded yet.";
  return data.groceries.length
    ? "Everything on your list is checked."
    : "Your grocery checklist is empty.";
}

function GroceryReminderLink({ item }: { item: GroceryData["groceries"][number] }) {
  const colors = useQuiet();
  if (item.pending || item.checked) return null;
  return (
    <Link
      href={{ pathname: "/grocery-reminder", params: { itemId: item.itemId } }}
      style={{ color: colors.accent, fontSize: 17, paddingVertical: 8 }}
    >
      Reminder for {item.name}
    </Link>
  );
}
