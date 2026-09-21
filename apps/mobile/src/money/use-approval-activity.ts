import { useCallback } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { onNetwork } from "../offline/network";
import type { ExpenseApprovalRuntime } from "./approval-runtime";
export function useApprovalActivity(runtime: ExpenseApprovalRuntime) {
  useFocusEffect(
    useCallback(() => {
      void runtime.setActive(AppState.currentState === "active");
      const foreground = AppState.addEventListener(
        "change",
        (state) => void runtime.setActive(state === "active"),
      );
      const network = onNetwork((state) => {
        if (state.isConnected && AppState.currentState === "active") void runtime.refresh();
      });
      return () => {
        foreground.remove();
        network.remove();
        void runtime.setActive(false);
      };
    }, [runtime]),
  );
}
