import { useCallback, useEffect } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import type { AgendaRuntime } from "../calendar/agenda-runtime";
/** Local-only reads: never request permission or publish availability from Today. */
export function useTodayAgenda(runtime: AgendaRuntime, now: number) {
  useFocusEffect(
    useCallback(() => {
      const activity = () => runtime.setActive(AppState.currentState === "active");
      activity();
      const subscription = AppState.addEventListener("change", activity);
      return () => {
        subscription.remove();
        runtime.setActive(false);
      };
    }, [runtime]),
  );
  useEffect(() => {
    void runtime.refresh();
  }, [runtime, now]);
}
