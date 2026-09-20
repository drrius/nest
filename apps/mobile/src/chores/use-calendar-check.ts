import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import * as Effect from "effect/Effect";
import { useCalendarSharing } from "../calendar/provider";
import { expoCalendarPort } from "../calendar/expo-calendar";
import { makeCalendarReader } from "../calendar/service";
import { choreCalendarWarning } from "../calendar/chore-warning";
import type { CalendarRuntime } from "../calendar/runtime";
import { sameConsent } from "../calendar/selection";

export function useChoreCalendarCheck() {
  const calendar = useCalendarSharing();
  const lifetime = useRef<AbortController | null>(null);
  const active = useRef(false);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      lifetime.current = null;
      controller.abort();
    };
  }, []);
  const check = async (date: string, save: () => void) => {
    const controller = lifetime.current;
    if (!controller || active.current) return;
    active.current = true;
    setChecking(true);
    const state = calendar?.getSnapshot();
    const selection = state?.selection;
    const ids = selectedIds(state);
    try {
      const captured = await Effect.runPromise(
        choreCalendarWarning(makeCalendarReader(expoCalendarPort), ids, date, Date.now()),
        { signal: controller.signal },
      ).catch(() => "unknown" as const);
      if (controller.signal.aborted) return;
      const result = selection === calendar?.getSnapshot().selection ? captured : "unknown";
      if (result === "free") save();
      else
        confirmWarning(result, () => {
          if (!controller.signal.aborted) save();
        });
    } finally {
      active.current = false;
      if (!controller.signal.aborted) setChecking(false);
    }
  };
  return { checking, check };
}

function selectedIds(state: ReturnType<CalendarRuntime["getSnapshot"]> | undefined) {
  const selection = state?.selection;
  return selection?.status === "active" &&
    state?.consent &&
    sameConsent(selection.consent, state.consent)
    ? selection.calendarIds
    : [];
}
function confirmWarning(result: string, save: () => void) {
  Alert.alert(
    result === "busy" ? "Busy time on this day" : "Calendar availability unknown",
    result === "busy"
      ? "Your selected calendars have busy time on this date. Chores have no set time, so you can still choose this day."
      : "Your selected calendar availability could not be checked. You can still choose this day.",
    [
      { text: "Choose another date", style: "cancel" },
      { text: "Reschedule anyway", onPress: save },
    ],
  );
}
