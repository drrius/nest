import { useCallback } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { onNetwork, networkState } from "../offline/network";
import type { ReceiptViewRuntime } from "./receipt-view-runtime";
export function useReceiptViewActivity(runtime: ReceiptViewRuntime) {
  useFocusEffect(
    useCallback(() => {
      let live = true,
        observed = false;
      void runtime.setActive(AppState.currentState === "active");
      const foreground = AppState.addEventListener(
        "change",
        (state) => void runtime.setActive(state === "active"),
      );
      const network = onNetwork((state) => {
        observed = true;
        void runtime.setOnline(state.isConnected === true && state.isInternetReachable !== false);
      });
      void networkState()
        .then((state) => {
          if (live && !observed)
            void runtime.setOnline(
              state.isConnected === true && state.isInternetReachable !== false,
            );
        })
        .catch(() => {});
      return () => {
        live = false;
        foreground.remove();
        network.remove();
        void runtime.setActive(false);
      };
    }, [runtime]),
  );
}
