import { householdDate } from "@nest/domain/calendar";
import { useCallback, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
export const currentHouseholdDay = () => householdDate(new Date());
/** Refresh the civil day on return and while this screen stays open across midnight. */
export function useHouseholdDay() {
  const [date, setDate] = useState(currentHouseholdDay);
  useFocusEffect(
    useCallback(() => {
      const refresh = () => setDate(currentHouseholdDay());
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
  return date;
}
