import { useState, useSyncExternalStore } from "react";
import { FlatList, Text } from "react-native";
import { Note, Page, Card } from "../components/page";
import { NativeAction } from "../components/native-action";
import { space, useQuiet } from "../theme";
import type { AgendaRow } from "./agenda";
import type { AgendaRuntime, AgendaView } from "./agenda-runtime";
import { AgendaControls } from "./agenda-controls";
import { AgendaCalendarPicker } from "./agenda-calendar-picker";
import type { PartnerRuntime } from "./partner-runtime";
import { partnerAgenda } from "./partner-agenda";
import { agendaDay } from "./agenda-day";
import { agendaRows } from "./agenda-rows";
import { PartnerStatus, PartnerBlock } from "./partner-content";
export function AgendaContent({
  runtime,
  partner,
  verify,
}: {
  runtime: AgendaRuntime;
  partner: PartnerRuntime;
  verify: () => void;
}) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    colors = useQuiet();
  const shared = useSyncExternalStore(partner.subscribe, partner.getSnapshot);
  const [choosing, setChoosing] = useState(false);
  if (!view.active)
    return (
      <Page>
        <Note>Open Calendar to read your agenda.</Note>
      </Page>
    );
  if (!view.access)
    return (
      <Page>
        <Note>{view.notice}</Note>
        <NativeAction label="Verify account" onPress={verify} />
      </Page>
    );
  if (choosing)
    return <AgendaCalendarPicker runtime={runtime} view={view} close={() => setChoosing(false)} />;
  const personal = view.result?.status === "ready" ? view.result.rows : [];
  const window = agendaDay(view.date);
  const assessment =
    window && shared.active
      ? partnerAgenda(shared.snapshots, partner.actor, window, shared.asOf)
      : { status: "unknown" as const };
  const rows = agendaRows(personal, assessment.status === "known" ? assessment.intervals : []);
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, paddingBottom: 48, gap: space.medium }}
      data={rows}
      keyExtractor={(row) => row.key}
      ListHeaderComponent={
        <>
          <AgendaControls runtime={runtime} view={view} choose={() => setChoosing(true)} />
          <PartnerStatus assessment={assessment} runtime={partner} view={shared} verify={verify} />
          <PersonalStatus view={view} />
        </>
      }
      renderItem={({ item }) =>
        item.kind === "partner" ? (
          <PartnerBlock {...item.value} />
        ) : (
          <PersonalEvent
            row={item.value}
            calendar={
              view.calendars.find((calendar) => calendar.id === item.value.calendarId)?.title ??
              "Your calendar"
            }
          />
        )
      }
    />
  );
}
function PersonalEvent({ row, calendar }: { row: AgendaRow; calendar: string }) {
  const colors = useQuiet();
  const format = (instant: number) =>
    new Date(instant).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <Card>
      <Text selectable style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>
        {row.title || "Untitled event"}
      </Text>
      <Note>{calendar} · Personal details on this iPhone</Note>
      <Note>
        {row.allDay ? "All day · " : ""}
        {format(row.start)} — {format(row.end)}
      </Note>
      {row.location ? <Note>{row.location}</Note> : null}
      {row.notes ? <Note>{row.notes}</Note> : null}
    </Card>
  );
}

function PersonalStatus({ view }: { view: AgendaView }) {
  if (view.result?.status !== "ready" || view.result.rows.length) return null;
  return (
    <Note>
      {view.selection?.calendarIds.length
        ? "No personal events in your selected calendars for this day."
        : "Choose calendars to see your personal events alongside shared busy blocks."}
    </Note>
  );
}
