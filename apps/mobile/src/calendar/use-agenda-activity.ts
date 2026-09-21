import { useCallback } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { onNetwork } from "../offline/network";
import type { AgendaRuntime } from "./agenda-runtime";
import type { PartnerRuntime } from "./partner-runtime";
export function useAgendaActivity(runtime: AgendaRuntime | null, partner: PartnerRuntime | null) {
  useFocusEffect(
    useCallback(() => {
      if (!runtime || !partner) return;
      const activity = () => {
        const active = AppState.currentState === "active";
        runtime.setActive(active);
        void partner.setActive(active);
      };
      activity();
      const subscription = AppState.addEventListener("change", activity);
      let network: { remove(): void } | undefined;
      try {
        network = onNetwork((state) => {
          if (state.isConnected === true && state.isInternetReachable !== false)
            void partner.refresh();
        });
      } catch {
        /* Explicit and foreground refresh remain available. */
      }
      const timer = setInterval(() => {
        void runtime.refresh();
        void partner.refresh();
      }, 60000);
      return () => {
        clearInterval(timer);
        subscription.remove();
        network?.remove();
        runtime.setActive(false);
        void partner.setActive(false);
      };
    }, [runtime, partner]),
  );
}
