import DateTimePicker from "@expo/ui/community/datetime-picker";
import { Link } from "expo-router";
import { NativeAction } from "../components/native-action";
import { Section, Note } from "../components/page";
import { adjacentDay, agendaDay, localDate } from "./agenda-day";
import type { AgendaRuntime, AgendaView } from "./agenda-runtime";
export function AgendaControls({
  runtime,
  view,
  choose,
}: {
  runtime: AgendaRuntime;
  view: AgendaView;
  choose: () => void;
}) {
  const window = agendaDay(view.date);
  const dateDisabled = view.busy || !view.loaded || !view.permission;
  return (
    <Section title="Your agenda">
      <Note>Personal event details stay on this iPhone. Viewing a calendar does not share it.</Note>
      <Note>{view.date} · Times follow this iPhone’s time zone.</Note>
      {process.env.EXPO_OS === "ios" && window ? (
        <DateTimePicker
          value={new Date(window.start)}
          mode="date"
          disabled={dateDisabled}
          onChange={(_event, date) => {
            if (date) void runtime.changeDate(localDate(date));
          }}
        />
      ) : null}
      <NativeAction
        label="Previous day"
        disabled={dateDisabled || !adjacentDay(view.date, -1)}
        onPress={() => {
          const date = adjacentDay(view.date, -1);
          if (date) void runtime.changeDate(date);
        }}
      />
      <NativeAction
        label="Next day"
        disabled={dateDisabled || !adjacentDay(view.date, 1)}
        onPress={() => {
          const date = adjacentDay(view.date, 1);
          if (date) void runtime.changeDate(date);
        }}
      />
      <NativeAction
        label="Today"
        disabled={dateDisabled}
        onPress={() => {
          void runtime.changeDate(localDate(new Date()));
        }}
      />
      <AgendaStatus runtime={runtime} view={view} />
      <NativeAction
        label="Choose calendars to show"
        disabled={view.busy || !view.permission}
        onPress={choose}
      />
      <NativeAction
        label="Refresh agenda"
        disabled={view.busy}
        onPress={() => {
          void runtime.refresh();
        }}
      />
      <Link href="/calendar-sharing">Manage busy sharing</Link>
      <Note>Manage general events in Apple Calendar.</Note>
    </Section>
  );
}
function AgendaStatus({ runtime, view }: { runtime: AgendaRuntime; view: AgendaView }) {
  return (
    <>
      {view.busy ? <Note>Loading or saving…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.loaded && !view.permission ? (
        <>
          <Note>
            Calendar access is off. Allow reading to show existing calendars, or enable access in
            iPhone Settings. Other Nest features still work.
          </Note>
          <NativeAction
            label="Allow calendar access"
            disabled={view.busy}
            onPress={() => {
              void runtime.requestPermission();
            }}
          />
        </>
      ) : null}
      {view.result?.status === "unavailable" ? (
        <Note>
          {view.result.reason === "missing_calendar"
            ? "A selected calendar is no longer available. Choose calendars available on this iPhone."
            : "Could not read this agenda. Refresh after checking calendar access; an empty agenda is not confirmed."}
        </Note>
      ) : null}
    </>
  );
}
