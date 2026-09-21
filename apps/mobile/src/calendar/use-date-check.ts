import { useEffect, useMemo, useRef, useState } from "react";
import { confirmDayWarning, type CalendarWarningKind } from "./confirm-day-warning";
import * as Effect from "effect/Effect";
import { useCalendarSharing } from "./provider";
import { expoCalendarPort } from "./expo-calendar";
import { makeCalendarReader } from "./service";
import { choreCalendarWarning } from "./chore-warning";
import type { CalendarRuntime } from "./runtime";
import { calendarReadScope } from "./day-check-scope";

export function useCalendarDateCheck(kind: CalendarWarningKind) {
  const calendar = useCalendarSharing();
  const lifetime = useRef<AbortController | null>(null);
  const active = useRef<AbortController | null>(null);
  const scope = useMemo(() => ({ calendar }), [calendar]);
  const [pending, setPending] = useState<typeof scope | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      lifetime.current = null;
      controller.abort();
    };
  }, [calendar]);
  const check = async (date: string, save: () => void) => {
    const controller = lifetime.current;
    if (!controller || active.current === controller) return;
    active.current = controller;
    setPending(scope);
    const { selection, ids } = selectedScope(calendar);
    try {
      const captured = await Effect.runPromise(
        choreCalendarWarning(makeCalendarReader(expoCalendarPort), ids, date, Date.now()),
        { signal: controller.signal },
      ).catch(() => "unknown" as const);
      if (controller.signal.aborted) return;
      const result = selection === selectedScope(calendar).selection ? captured : "unknown";
      const accepted =
        result === "free" || (await confirmDayWarning(kind, result, controller.signal));
      if (accepted && !controller.signal.aborted) save();
    } finally {
      if (active.current === controller) active.current = null;
      if (lifetime.current === controller) setPending(null);
    }
  };
  return { checking: pending === scope, check };
}

function selectedScope(calendar: CalendarRuntime | null) {
  const selection = calendarReadScope(calendar?.getSnapshot());
  return { selection, ids: selection?.calendarIds ?? [] };
}
