import * as Effect from "effect/Effect";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import type { CookingClient } from "../cooking/client";
export const allMealSlots = ["breakfast", "lunch", "dinner"] as const;
type Slot = (typeof allMealSlots)[number];
export function useVisibleMealSlots(client: CookingClient) {
  const [slots, setSlots] = useState<readonly Slot[]>(allMealSlots);
  const [notice, setNotice] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      void Effect.runPromise(client.read(), { signal: controller.signal })
        .then((profile) => {
          if (controller.signal.aborted) return;
          setSlots(
            profile
              ? allMealSlots.filter((slot) => profile.preferences.mealSlots.includes(slot))
              : allMealSlots,
          );
          setNotice(null);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setNotice(
              "Could not refresh visible meal slots. Use Show all slots to see every saved meal.",
            );
        });
      return () => controller.abort();
    }, [client]),
  );
  return { slots, notice };
}
