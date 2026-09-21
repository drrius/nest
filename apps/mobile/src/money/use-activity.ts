import { useCallback } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { onNetwork } from "../offline/network";
import type { MoneyReadRuntime } from "./read-runtime";
export function useMoneyActivity(runtimes: readonly MoneyReadRuntime[]) {
  useFocusEffect(
    useCallback(() => {
      const activate = (active: boolean) => {
        for (const runtime of runtimes) void runtime.setActive(active);
      };
      activate(AppState.currentState === "active");
      const foreground = AppState.addEventListener("change", (state) =>
        activate(state === "active"),
      );
      const network = onNetwork((state) => {
        if (state.isConnected && AppState.currentState === "active")
          for (const runtime of runtimes) void runtime.refresh();
      });
      return () => {
        foreground.remove();
        network.remove();
        activate(false);
      };
    }, [runtimes]),
  );
}
