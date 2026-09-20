import { useRef, useState } from "react";
import { Alert, FlatList, View } from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import * as Crypto from "expo-crypto";
import { Card, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { space, useQuiet } from "../theme";
import { RecipeFields, useRecipeFields } from "./recipe-fields";
import { RecipeIngredientEditor, type DraftIngredient } from "./recipe-ingredient-editor";
import { RecipeCreationRecovery } from "./recipe-creation-recovery";
import type { RecipeCreationRuntime, RecipeCreationView } from "./recipe-creation-runtime";
export function RecipeCreationForm({
  runtime,
  view,
  verify,
}: {
  runtime: RecipeCreationRuntime;
  view: RecipeCreationView;
  verify: () => void;
}) {
  const draft = useRecipeDraft(view),
    colors = useQuiet();
  const { fields, ingredients, setIngredients, editing, list, edit } = draft;
  const showDraft = view.stage !== "verify" && !view.receipt;
  const editable = !view.busy && view.stage === "ready" && view.revision !== null;
  return (
    <FlatList
      ref={list}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      data={showDraft ? ingredients : []}
      keyExtractor={(item) => item.key}
      renderItem={({ item, index }) => (
        <IngredientRow
          item={item}
          index={index}
          count={ingredients.length}
          disabled={!editable || !!editing}
          edit={() => edit(item)}
          remove={() => setIngredients((items) => items.filter((old) => old.key !== item.key))}
          move={(delta) => setIngredients((items) => moveIngredient(items, index, delta))}
        />
      )}
      ListHeaderComponent={
        <View style={{ gap: space.medium }}>
          <RecipeStatus runtime={runtime} view={view} verify={verify} />
          {showDraft ? <RecipeDraftHeader draft={draft} editable={editable} /> : null}
        </View>
      }
      ListFooterComponent={
        showDraft ? (
          <NativeAction
            label="Save recipe online"
            disabled={!editable || !!editing || !ingredients.length}
            onPress={() =>
              void runtime.save({
                ...fields.read(),
                ingredients: ingredients.map(({ key: _key, ...ingredient }) => ingredient),
              })
            }
          />
        ) : null
      }
    />
  );
}
function useRecipeDraft(view: RecipeCreationView) {
  const fields = useRecipeFields(),
    navigation = useNavigation();
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([]),
    [editing, setEditing] = useState<DraftIngredient | null>(null);
  const list = useRef<FlatList<DraftIngredient>>(null);
  usePreventRemove(true, ({ data }) => {
    if (view.receipt || (!fields.dirty() && !ingredients.length && !editing && !view.pendingWrite))
      return navigation.dispatch(data.action);
    Alert.alert(
      "Leave this recipe?",
      "Your draft and retry details will be lost. A recipe already sent may still be saved. Check the library before saving it again.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
  const edit = (item: DraftIngredient) => {
    setEditing(item);
    list.current?.scrollToOffset({ offset: 0, animated: false });
  };
  const keep = (item: DraftIngredient) => {
    setIngredients((items) =>
      items.some((old) => old.key === item.key)
        ? items.map((old) => (old.key === item.key ? item : old))
        : [...items, item],
    );
    setEditing(null);
  };
  return { fields, ingredients, setIngredients, editing, setEditing, list, edit, keep };
}
function RecipeDraftHeader({
  draft,
  editable,
}: {
  draft: ReturnType<typeof useRecipeDraft>;
  editable: boolean;
}) {
  const { fields, ingredients, editing, edit, keep, setEditing } = draft;
  return (
    <>
      <Card>
        <Note>
          Save a household recipe online. Planning meals and adding groceries are separate steps.
        </Note>
        <RecipeFields fields={fields} editable={editable && !editing} />
      </Card>
      {editing && editable ? (
        <RecipeIngredientEditor
          key={editing.key}
          item={editing}
          onSave={keep}
          onCancel={() => setEditing(null)}
        />
      ) : null}
      <Note>{ingredients.length} of 200 ingredients. Quantities and units stay separate.</Note>
      <NativeAction
        label="Add ingredient"
        disabled={!editable || !!editing || ingredients.length >= 200}
        onPress={() =>
          edit({
            key: Crypto.randomUUID(),
            name: "",
            quantity: null,
            unit: null,
            note: null,
            categoryId: null,
          })
        }
      />
    </>
  );
}
export function moveIngredient(items: DraftIngredient[], index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const result = [...items];
  [result[index], result[target]] = [result[target]!, result[index]!];
  return result;
}
function IngredientRow({
  item,
  index,
  count,
  disabled,
  edit,
  remove,
  move,
}: {
  item: DraftIngredient;
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
          Alert.alert("Remove ingredient?", item.name, [
            { text: "Keep", style: "cancel" },
            { text: "Remove", style: "destructive", onPress: remove },
          ])
        }
      />
    </Card>
  );
}
function RecipeStatus({
  runtime,
  view,
  verify,
}: {
  runtime: RecipeCreationRuntime;
  view: RecipeCreationView;
  verify: () => void;
}) {
  const router = useRouter();
  return (
    <>
      {view.busy ? (
        <Note>{view.pendingWrite ? "Saving recipe…" : "Loading current library…"}</Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <RecipeCreationRecovery runtime={runtime} view={view} verify={verify} />
      {view.receipt ? (
        <NativeAction
          label="Open saved recipe"
          disabled={view.stage !== "saved" || !view.revision}
          onPress={() =>
            router.replace({
              pathname: "/saved-meal",
              params: {
                definitionId: view.receipt!.definitionId,
                expectedRevision: view.revision!,
              },
            })
          }
        />
      ) : null}
      <NativeAction label="View saved recipes" onPress={() => router.dismissTo("/meal-library")} />
    </>
  );
}
