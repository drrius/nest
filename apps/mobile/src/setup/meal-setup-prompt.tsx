import { useCallback, useState, useSyncExternalStore } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { useSession } from "../session/provider";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { SetupClient } from "./client";
import type { SetupRuntime } from "./runtime";
import { setupOwner } from "./owner";

export function MealSetupPrompt() {
  const session = useSession();
  if (session.state.status !== "ready" || !session.setup) return null;
  return (
    <PromptOwner
      key={`${session.state.member.userId}:${session.state.member.householdId}`}
      client={session.setup}
    />
  );
}

function PromptOwner({ client }: { client: SetupClient }) {
  const [owner] = useState(() => setupOwner(client));
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? <Prompt runtime={runtime} /> : null;
}

function Prompt({ runtime }: { runtime: SetupRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      void runtime.load();
      return runtime.cancel;
    }, [runtime]),
  );
  if (dismissed || view.busy || view.verify) return null;
  if (!view.status)
    return view.error ? (
      <Card>
        <Note>Food setup could not be checked. You can keep using meals and try again online.</Note>
        <NativeAction label="Retry food setup check" onPress={() => void runtime.load()} />
        <NativeAction label="Not now" onPress={() => setDismissed(true)} />
      </Card>
    ) : null;
  const foodMissing = !view.status.foodConfigured;
  const cookingMissing = !view.status.cookingConfigured;
  if (!foodMissing && !cookingMissing) return null;
  return (
    <Card>
      <Section title="Make meals yours" />
      {foodMissing ? (
        <>
          <Note>
            Add your dietary restrictions and dislikes to guide household meal plans. Optional
            calorie goals stay private. Your partner sets up their own preferences.
          </Note>
          <NativeAction
            label="Set up your food preferences"
            onPress={() => router.push("/food-preferences")}
          />
        </>
      ) : null}
      {cookingMissing ? (
        <>
          <Note>Choose the household’s cooking preferences and visible meal slots together.</Note>
          <NativeAction
            label="Set up household cooking"
            onPress={() => router.push("/cooking-preferences")}
          />
        </>
      ) : null}
      <Note>You can continue now and edit these choices later in settings.</Note>
      <NativeAction label="Not now" onPress={() => setDismissed(true)} />
    </Card>
  );
}
