import type { assessAgendaAvailability } from "@nest/domain/availability";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { PartnerRuntime, PartnerView } from "./partner-runtime";
export type PartnerAssessment = ReturnType<typeof assessAgendaAvailability>;
export const agendaTime = (instant: number) =>
  new Date(instant).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
export function PartnerStatus({
  assessment,
  runtime,
  view,
  verify,
}: {
  assessment: PartnerAssessment;
  runtime: PartnerRuntime;
  view: PartnerView;
  verify: () => void;
}) {
  return (
    <Section title="Partner availability">
      {view.busy ? <Note>Refreshing shared availability…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {assessment.status === "unknown" ? (
        <Note>
          Availability is unknown for this day. Missing, expired or unshared calendars do not mean
          free time.
        </Note>
      ) : (
        <>
          <Note>
            Shared {agendaTime(assessment.capturedAt)} · expires {agendaTime(assessment.expiresAt)}.
          </Note>
          <Note>
            Coverage: {agendaTime(assessment.covered.start)} — {agendaTime(assessment.covered.end)}.
          </Note>
          {!assessment.complete ? <Note>The rest of this day is unknown.</Note> : null}
          {!assessment.intervals.length ? (
            <Note>
              No shared busy blocks in this coverage. This does not guarantee availability.
            </Note>
          ) : (
            <Note>Busy blocks below include no personal event details.</Note>
          )}
        </>
      )}
      {view.access ? (
        <NativeAction
          label="Refresh partner availability"
          disabled={view.busy}
          onPress={() => {
            void runtime.refresh();
          }}
        />
      ) : (
        <NativeAction label="Verify account" onPress={verify} />
      )}
    </Section>
  );
}
export function PartnerBlock({ start, end }: { start: number; end: number }) {
  return (
    <Card>
      <Note>Partner busy · shared time only</Note>
      <Note>
        {agendaTime(start)} — {agendaTime(end)}
      </Note>
    </Card>
  );
}
