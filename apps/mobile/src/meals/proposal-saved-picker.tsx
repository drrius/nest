import { useState, useSyncExternalStore } from "react";
import { FlatList, View } from "react-native";
import type { MealLibraryClient } from "./library-client";
import type { MealLibraryRuntime } from "./library-runtime";
import { mealLibraryOwner } from "./library-owner";
import { useMealWeekRefresh } from "./use-refresh";
import { NativeAction } from "../components/native-action";
import { Page, Note } from "../components/page";
import { space, useQuiet } from "../theme";
type Props = {
  client: MealLibraryClient;
  close: () => void;
  choose: (definitionId: string, revision: string) => void;
  verify: () => void;
};
export function ProposalSavedPicker(props: Props) {
  const [owner] = useState(() => mealLibraryOwner(props.client));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <SavedChoices {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening saved recipes…</Note>
    </Page>
  );
}
function SavedChoices({ runtime, close, choose, verify }: Props & { runtime: MealLibraryRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    colors = useQuiet();
  useMealWeekRefresh(runtime);
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      data={view.meals}
      keyExtractor={(meal) => meal.definitionId}
      ListHeaderComponent={
        <View style={{ gap: space.medium }}>
          <NativeAction label="Back to preview" onPress={close} />
          <Note>
            Choose a saved recipe for this suggestion. It will be checked against both partners’
            food preferences. The rest of your preview stays in place.
          </Note>
          {view.notice ? <Note>{view.notice}</Note> : null}
          {view.busy ? <Note>Loading saved recipes…</Note> : null}
          <NativeAction
            label={view.access === "verify" ? "Verify account" : "Refresh recipes"}
            disabled={view.busy}
            onPress={() => {
              if (view.access === "verify") verify();
              else void runtime.load();
            }}
          />
        </View>
      }
      renderItem={({ item }) => (
        <NativeAction
          label={`Use ${item.title}`}
          disabled={!view.fresh || view.busy || view.access !== "ready"}
          onPress={() => {
            if (view.revision) choose(item.definitionId, view.revision);
          }}
        />
      )}
      ListEmptyComponent={
        view.fresh && !view.busy ? (
          <Note>
            No saved recipes are available. Add a complete recipe to your library, then return to
            choose it.
          </Note>
        ) : null
      }
      ListFooterComponent={
        view.nextAfterId ? (
          <NativeAction
            label="More recipes"
            disabled={view.busy || !view.fresh}
            onPress={() => {
              void runtime.more();
            }}
          />
        ) : null
      }
    />
  );
}
