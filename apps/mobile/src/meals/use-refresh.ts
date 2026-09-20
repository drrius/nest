import { useCallback } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { onNetwork } from "../offline/network";
export function useMealWeekRefresh(runtime: { load: () => Promise<void>; cancel: () => void }) {
  useFocusEffect(
    useCallback(() => {
      void runtime.load();
      const foreground = AppState.addEventListener("change", (state) => {
        if (state === "active") void runtime.load();
      });
      const network = onNetwork((state) => {
        if (state.isConnected && AppState.currentState === "active") void runtime.load();
      });
      return () => {
        foreground.remove();
        network.remove();
        runtime.cancel();
      };
    }, [runtime]),
  );
}
