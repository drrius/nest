import { useState } from "react";
import { View } from "react-native";
import { Note } from "../components/page";
import { QuietAction } from "../components/quiet-action";
import { space } from "../theme";
import { CalendarChoreControls } from "./chore-content";
import { CalendarRenewalControls } from "./renewal-content";
import { PartnerStatus, agendaTime, type PartnerAssessment } from "./partner-content";
import type { CalendarChoreRuntime, CalendarChoreView } from "./chore-runtime";
import type { CalendarRenewalRuntime, CalendarRenewalView } from "./renewal-runtime";
import type { PartnerRuntime, PartnerView } from "./partner-runtime";

export function AgendaLayers({
  assessment,
  partner,
  shared,
  chores,
  work,
  renewals,
  deadlines,
  verify,
  choose,
  canChoose,
}: {
  assessment: PartnerAssessment;
  partner: PartnerRuntime;
  shared: PartnerView;
  chores: CalendarChoreRuntime;
  work: CalendarChoreView;
  renewals: CalendarRenewalRuntime;
  deadlines: CalendarRenewalView;
  verify: () => void;
  choose: () => void;
  canChoose: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={{ gap: space.medium, paddingVertical: space.medium }}>
      <QuietAction
        label={expanded ? "Hide calendars & layers" : "Calendars & layers"}
        onPress={() => setExpanded(!expanded)}
      />
      {expanded ? (
        <>
          <QuietAction label="Choose calendars to show" disabled={!canChoose} onPress={choose} />
          <PartnerStatus assessment={assessment} runtime={partner} view={shared} verify={verify} />
          <CalendarChoreControls runtime={chores} view={work} verify={verify} />
          <CalendarRenewalControls runtime={renewals} view={deadlines} verify={verify} />
          <Note>
            Personal details stay on this iPhone. Manage general events in Apple Calendar.
          </Note>
        </>
      ) : (
        <>
          <Note>
            {assessment.status === "unknown"
              ? "Partner availability is unknown. Unshared calendars do not mean free time."
              : `Busy sharing updated ${agendaTime(assessment.capturedAt)}. Only shared times are shown.`}
          </Note>
          {assessment.status === "known" && !assessment.complete ? (
            <Note>The rest of this day is unknown.</Note>
          ) : null}
          <LayerFailure label="Partner availability" notice={shared.notice} />
          <LayerFailure label="Chores" notice={work.enabled ? work.notice : null} />
          <LayerFailure label="Renewals" notice={deadlines.enabled ? deadlines.notice : null} />
        </>
      )}
    </View>
  );
}
function LayerFailure({ label, notice }: { label: string; notice: string | null }) {
  return notice ? (
    <Note>
      {label}: {notice} Open Calendars & layers to retry.
    </Note>
  ) : null;
}
