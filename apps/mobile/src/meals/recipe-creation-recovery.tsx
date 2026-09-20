import { NativeAction } from "../components/native-action";
import type { RecipeCreationRuntime, RecipeCreationView } from "./recipe-creation-runtime";
export function RecipeCreationRecovery({
  runtime,
  view,
  verify,
}: {
  runtime: RecipeCreationRuntime;
  view: RecipeCreationView;
  verify: () => void;
}) {
  if (view.stage === "uncertain")
    return (
      <NativeAction
        label="Retry this exact recipe"
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
          void runtime.load();
        }}
      />
    );
  if (view.stage === "reload")
    return (
      <NativeAction
        label="Reload library"
        disabled={view.busy}
        onPress={() => void runtime.load()}
      />
    );
  return null;
}
