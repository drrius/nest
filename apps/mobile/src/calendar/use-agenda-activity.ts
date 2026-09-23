import type { CalendarRenewalRuntime } from "./renewal-runtime";
import type { CalendarChoreRuntime } from "./chore-runtime";
import { useCallback } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { onNetwork } from "../offline/network";
import type { AgendaRuntime } from "./agenda-runtime";
import type { PartnerRuntime } from "./partner-runtime";
export function useAgendaActivity(
  runtime: AgendaRuntime | null,
  partner: PartnerRuntime | null,
  chores: CalendarChoreRuntime | null,
  renewals: CalendarRenewalRuntime | null,
) {
  useFocusEffect(
    useCallback(() => {
      if (!runtime || !partner || !chores || !renewals) return;
      const dateChanged = () => {
        void chores.changeDate(runtime.getSnapshot().date);
        void renewals.changeDate(runtime.getSnapshot().date);
      };
      dateChanged();
      const unsubscribe = runtime.subscribe(dateChanged);
      const activity = () => {
        const active = AppState.currentState === "active";
        runtime.setActive(active);
        void partner.setActive(active);
        void chores.setActive(active);
        void renewals.setActive(active);
      };
      activity();
      const subscription = AppState.addEventListener("change", activity);
      let network: { remove(): void } | undefined;
      try {
        network = onNetwork((state) => {
          if (state.isConnected === true && state.isInternetReachable !== false) {
            void partner.refresh();
            void chores.refresh();
            void renewals.refresh();
          }
        });
      } catch {
        /* Explicit and foreground refresh remain available. */
      }
      const timer = setInterval(() => {
        void runtime.refresh();
        void partner.refresh();
        void chores.refresh();
        void renewals.refresh();
      }, 60000);
      return () => {
        clearInterval(timer);
        unsubscribe();
        subscription.remove();
        network?.remove();
        runtime.setActive(false);
        void partner.setActive(false);
        void chores.setActive(false);
        void renewals.setActive(false);
      };
    }, [runtime, partner, chores, renewals]),
  );
}
