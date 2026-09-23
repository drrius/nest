import { householdDate } from "@nest/domain/calendar";
import { useCallback, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
export const currentHouseholdDay = () => householdDate(new Date());
/** Refresh the current time on return and while this screen stays open across midnight. */
export function useTodayClock() {
  const [now, setNow] = useState(Date.now);
  useFocusEffect(
    useCallback(() => {
      const refresh = () => setNow(Date.now());
      refresh();
      const activity = AppState.addEventListener("change", (state) => {
        if (state === "active") refresh();
      });
      const timer = setInterval(() => {
        if (AppState.currentState === "active") refresh();
      }, 60_000);
      return () => {
        activity.remove();
        clearInterval(timer);
      };
    }, []),
  );
  return now;
}
