import { useRouter } from "expo-router";
import { Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { RecipeEditRuntime, RecipeEditView } from "./recipe-edit-runtime";
export function RecipeEditStatus({
  runtime,
  view,
  verify,
  reload,
}: {
  runtime: RecipeEditRuntime;
  view: RecipeEditView;
  verify: () => void;
  reload?: () => void;
}) {
  const router = useRouter();
  return (
    <>
      {view.busy ? (
        <Note>{view.pendingWrite ? "Saving recipe…" : "Loading current recipe…"}</Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <RecipeEditRecovery runtime={runtime} view={view} verify={verify} reload={reload} />
      {view.receipt && view.stage === "saved" && view.snapshot?.recipe ? (
        <NativeAction
          label="Open saved recipe"
          onPress={() =>
            router.replace({
              pathname: "/saved-meal",
              params: {
                definitionId: view.receipt!.definitionId,
                expectedRevision: view.snapshot!.revision,
              },
            })
          }
        />
      ) : null}
      {view.snapshot?.recipe === null ? (
        <Note>This recipe is no longer in the active library.</Note>
      ) : null}
      <NativeAction label="View saved recipes" onPress={() => router.dismissTo("/meal-library")} />
    </>
  );
}
function RecipeEditRecovery({
  runtime,
  view,
  verify,
  reload,
}: {
  runtime: RecipeEditRuntime;
  view: RecipeEditView;
  verify: () => void;
  reload?: () => void;
}) {
  if (view.stage === "uncertain")
    return (
      <NativeAction
        label="Retry this exact edit"
        disabled={view.busy}
        onPress={() => void runtime.retry()}
      />
    );
  if (view.stage === "verify")
    return (
      <NativeAction
        label="Verify account"
        disabled={view.busy}
        onPress={() => {
          verify();
          void runtime.load(true);
        }}
      />
    );
  if (view.stage === "reload")
    return (
      <NativeAction
        label="Reload current recipe"
        disabled={view.busy}
        onPress={reload ?? (() => void runtime.load(true))}
      />
    );
  return null;
}
