import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { router, useRootNavigationState } from "expo-router";
import * as Notifications from "expo-notifications";
import { useSession } from "../session/provider";
import { notificationOpening, type NotificationOpeningContext } from "./notification-opening";
function consumed(id: string) {
  const last = Notifications.getLastNotificationResponse();
  if (last?.notification.request.identifier === id) Notifications.clearLastNotificationResponse();
}
export function PushNotificationLifecycle() {
  const { state } = useSession();
  const navigation = useRootNavigationState();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [opening] = useState(() =>
    notificationOpening({
      navigate: (renewalId) => router.push({ pathname: "/renewal", params: { renewalId } }),
      navigateRecurring: (ruleId) =>
        router.push({ pathname: "/recurring-reminder", params: { ruleId } }),
      navigateGrocery: (itemId) =>
        router.push({ pathname: "/grocery-reminder", params: { itemId } }),
      navigateMeal: (entryId) => router.push({ pathname: "/meal-reminder", params: { entryId } }),
      navigateChore: (occurrenceId) =>
        router.push({ pathname: "/chore-reminder", params: { occurrenceId } }),
      navigateSummary: (summaryId) =>
        router.push({ pathname: "/daily-summary", params: { summaryId } }),
      consumed,
    }),
  );
  const status: NotificationOpeningContext["status"] =
    state.status === "ready"
      ? "ready"
      : ["signed_out", "logout_pending", "not_a_member"].includes(state.status)
        ? "signed_out"
        : "waiting";
  const householdId = state.status === "ready" ? state.member.householdId : null;
  const actorId = state.status === "ready" ? state.member.userId : null;
  useEffect(() => {
    opening.update({
      status,
      householdId,
      actorId,
      foreground,
      navigationReady: Boolean(navigation?.key),
    });
  }, [opening, status, householdId, actorId, foreground, navigation?.key]);
  useEffect(() => {
    const receive = (response: Notifications.NotificationResponse) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      opening.receive(
        response.notification.request.identifier,
        response.notification.request.content.data,
      );
    };
    const listener = Notifications.addNotificationResponseReceivedListener(receive);
    const previous = Notifications.getLastNotificationResponse();
    if (previous) receive(previous);
    const appState = AppState.addEventListener("change", (next) =>
      setForeground(next === "active"),
    );
    return () => {
      listener.remove();
      appState.remove();
    };
  }, [opening]);
  return null;
}
