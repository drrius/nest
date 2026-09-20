import { useState, useSyncExternalStore } from "react";
import { FlatList, View } from "react-native";
import { useRouter } from "expo-router";
import { useSession } from "../session/provider";
import type { MealLibraryClient } from "../meals/library-client";
import { mealLibraryOwner } from "../meals/library-owner";
import type { MealLibraryRuntime } from "../meals/library-runtime";
import { useMealWeekRefresh } from "../meals/use-refresh";
import { Page, Card, Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
import { space, useQuiet } from "../theme";
export default function MealLibraryScreen() {
  const session = useSession();
  if (session.state.status !== "ready" || !session.meals)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  return (
    <Library
      key={`${session.state.member.userId}:${session.state.member.householdId}`}
      client={session.meals.library}
      verify={session.retry}
    />
  );
}
function Library({ client, verify }: { client: MealLibraryClient; verify: () => void }) {
  const [owner] = useState(() => mealLibraryOwner(client));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <LibraryContent runtime={runtime} verify={verify} />
  ) : (
    <Page>
      <Note>Loading saved recipes…</Note>
    </Page>
  );
}
function LibraryContent({ runtime, verify }: { runtime: MealLibraryRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const colors = useQuiet(),
    router = useRouter();
  useMealWeekRefresh(runtime);
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      data={view.meals}
      keyExtractor={(meal) => meal.definitionId}
      renderItem={({ item }) => (
        <Card>
          <Section title={item.title} />
          <Note>
            {item.servings === null ? "Servings not recorded" : `${item.servings} servings`}
          </Note>
          <NativeAction
            label={`Open ${item.title}`}
            disabled={!view.fresh || view.busy}
            onPress={() => {
              if (view.revision !== null)
                router.push({
                  pathname: "/saved-meal",
                  params: { definitionId: item.definitionId, expectedRevision: view.revision },
                });
            }}
          />
        </Card>
      )}
      ListHeaderComponent={
        <View style={{ gap: space.medium }}>
          <Note>Recipes saved for your household.</Note>
          {view.notice ? <Note>{view.notice}</Note> : null}
          {view.busy ? <Note>Loading saved recipes…</Note> : null}
          <NativeAction
            label={view.access === "verify" ? "Verify account" : "Reload recipes"}
            disabled={view.busy}
            onPress={() => {
              if (view.access === "verify") verify();
              void runtime.load();
            }}
          />
        </View>
      }
      ListEmptyComponent={
        view.revision !== null && !view.busy ? <Note>No saved recipes yet.</Note> : null
      }
      ListFooterComponent={
        view.nextAfterId ? (
          <NativeAction
            label="Load more recipes"
            disabled={view.busy || !view.fresh}
            onPress={() => void runtime.more()}
          />
        ) : null
      }
    />
  );
}
