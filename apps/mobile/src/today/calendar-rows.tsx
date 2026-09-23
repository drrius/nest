import { Text } from "react-native";
import type { AgendaView } from "../calendar/agenda-runtime";
import { Card, Note } from "../components/page";
import { useQuiet } from "../theme";
function status(view: AgendaView) {
  if (!view.active) return "Open Today to read your calendar.";
  if (view.notice) return view.notice;
  if (!view.loaded) return "Opening your agenda…";
  if (!view.permission) return "Open Calendar to allow access. Other Nest features still work.";
  if (!view.selection?.calendarIds.length)
    return "Choose calendars in Calendar to see your commitments here.";
  if (view.result?.status !== "ready")
    return "Your agenda could not be read yet. Open Calendar to refresh or check access.";
  return null;
}
export function TodayCalendarRows({ view, now }: { view: AgendaView; now: number }) {
  const colors = useQuiet(),
    notice = status(view);
  if (notice) return <Note>{notice}</Note>;
  if (view.result?.status !== "ready") return null;
  const rows = view.result.rows.filter((row) => row.end >= now);
  return (
    <>
      <Note>Your selected calendars · details stay on this iPhone</Note>
      {!rows.length ? <Note>No more events in your selected calendars today.</Note> : null}
      {rows.slice(0, 3).map((row) => (
        <Card key={row.key}>
          <Text style={{ color: colors.text, fontSize: 19 }}>{row.title || "Untitled event"}</Text>
          <Note>
            {row.allDay
              ? "All day"
              : new Date(row.start).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
          </Note>
        </Card>
      ))}
      {rows.length > 3 ? <Note>More events are shown in Calendar.</Note> : null}
    </>
  );
}
