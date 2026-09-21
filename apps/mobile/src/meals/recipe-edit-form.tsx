import { useRef, useState } from "react";
import { Alert, FlatList, View } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import * as Crypto from "expo-crypto";
import type { SavedMeal } from "@nest/contracts/meal-library";
import { Card, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { space, useQuiet } from "../theme";
import { RecipeEditFields, useRecipeEditFields } from "./recipe-edit-fields";
import { RecipeEditIngredient, RecipeEditIngredientRow } from "./recipe-edit-ingredient";
import {
  editorIngredients,
  moveEditorIngredient,
  recipeEditChanges,
  type EditorIngredient,
} from "./recipe-edit-draft";
import { RecipeEditStatus } from "./recipe-edit-status";
import type { RecipeEditRuntime, RecipeEditView } from "./recipe-edit-runtime";
export function RecipeEditForm({
  runtime,
  view,
  recipe,
  verify,
}: {
  runtime: RecipeEditRuntime;
  view: RecipeEditView;
  recipe: SavedMeal;
  verify: () => void;
}) {
  const draft = useEditorDraft(recipe, view),
    colors = useQuiet();
  const { fields, items, setItems, editing, list, edit } = draft;
  const editable = !view.busy && view.stage === "ready";
  return (
    <FlatList
      ref={list}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      data={items}
      keyExtractor={(item) => item.key}
      renderItem={({ item, index }) => (
        <RecipeEditIngredientRow
          item={item}
          index={index}
          count={items.length}
          disabled={!editable || !!editing}
          edit={() => edit(item)}
          remove={() => setItems((old) => old.filter((entry) => entry.key !== item.key))}
          move={(delta) => setItems((old) => moveEditorIngredient(old, index, delta))}
        />
      )}
      ListHeaderComponent={
        <View style={{ gap: space.medium }}>
          <RecipeEditStatus
            runtime={runtime}
            view={view}
            verify={verify}
            reload={() => {
              if (!draft.dirty()) {
                void runtime.load(true);
                return;
              }
              Alert.alert(
                "Reload and discard this draft?",
                "The latest household recipe will replace your unsaved changes.",
                [
                  { text: "Keep draft", style: "cancel" },
                  { text: "Reload", style: "destructive", onPress: () => void runtime.load(true) },
                ],
              );
            }}
          />
          <EditorHeader draft={draft} editable={editable} />
        </View>
      }
      ListFooterComponent={
        <NativeAction
          label="Save recipe changes online"
          disabled={!editable || !!editing}
          onPress={() => void runtime.save(recipeEditChanges(recipe, fields.read(), items))}
        />
      }
    />
  );
}
function useEditorDraft(recipe: SavedMeal, view: RecipeEditView) {
  const fields = useRecipeEditFields(recipe),
    navigation = useNavigation();
  const [items, setItems] = useState(() => editorIngredients(recipe));
  const [editing, setEditing] = useState<EditorIngredient | null>(null);
  const list = useRef<FlatList<EditorIngredient>>(null);
  const dirty = () =>
    fields.dirty() ||
    !!editing ||
    JSON.stringify(items) !== JSON.stringify(editorIngredients(recipe));
  usePreventRemove(true, ({ data }) => {
    if (!dirty() && !view.pendingWrite) return navigation.dispatch(data.action);
    Alert.alert(
      "Leave this recipe edit?",
      "Your draft and retry details will be lost. An edit already sent may still be saved. Check the current recipe before saving again.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", onPress: () => navigation.dispatch(data.action) },
      ],
    );
  });
  const edit = (item: EditorIngredient) => {
    setEditing(item);
    list.current?.scrollToOffset({ offset: 0, animated: false });
  };
  const keep = (item: EditorIngredient) => {
    setItems((old) =>
      old.some((entry) => entry.key === item.key)
        ? old.map((entry) => (entry.key === item.key ? item : entry))
        : [...old, item],
    );
    setEditing(null);
  };
  return { fields, items, setItems, editing, setEditing, list, edit, keep, dirty };
}
function EditorHeader({
  draft,
  editable,
}: {
  draft: ReturnType<typeof useEditorDraft>;
  editable: boolean;
}) {
  const { fields, items, editing, edit, keep, setEditing } = draft;
  return (
    <>
      <Card>
        <Note>
          Editing the saved recipe keeps existing planned meals and groceries unchanged. Missing
          servings or instructions stay unknown until you add them.
        </Note>
        <RecipeEditFields fields={fields} editable={editable && !editing} />
      </Card>
      {editing && editable ? (
        <RecipeEditIngredient
          key={editing.key}
          item={editing}
          onSave={keep}
          onCancel={() => setEditing(null)}
        />
      ) : null}
      <Note>{items.length} of 200 ingredients. Quantities and units stay separate.</Note>
      <NativeAction
        label="Add ingredient"
        disabled={!editable || !!editing || items.length >= 200}
        onPress={() =>
          edit({
            key: Crypto.randomUUID(),
            ingredientId: null,
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
