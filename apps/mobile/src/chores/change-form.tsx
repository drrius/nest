import { useState } from "react";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { householdDate } from "@nest/domain/calendar";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { ChoreChoice } from "./menu-types";
import { useChoreCalendarCheck } from "./use-calendar-check";

export function ChoreChangeForm({
  choice,
  disabled,
  submit,
  dismiss,
}: {
  choice: ChoreChoice;
  disabled: boolean;
  submit: (date?: string) => void;
  dismiss: () => void;
}) {
  const [date, setDate] = useState(choice.chore.dueDate);
  const { checking, check } = useChoreCalendarCheck();
  const locked = disabled || checking;
  const reschedule = choice.action === "reschedule";
  return (
    <Card>
      <Section title={`${reschedule ? "Reschedule" : "Skip"} ${choice.chore.title}`} />
      <Note>
        {reschedule
          ? "Move this occurrence to another day. The repeating schedule stays the same."
          : "Skip this occurrence and advance to the next scheduled turn. This does not mark it completed."}
      </Note>
      <Note>Needs a connection. Retry details stay here while this screen is open.</Note>
      {reschedule ? (
        <>
          <Note>
            Due date · Europe/Zurich. Your selected calendars will be checked before saving.
          </Note>
          <DateTimePicker
            mode="date"
            value={new Date(`${date}T12:00:00Z`)}
            timeZoneName="Europe/Zurich"
            disabled={locked}
            onChange={(_, value) => {
              if (value) setDate(householdDate(value));
            }}
          />
        </>
      ) : null}
      <NativeAction
        label={
          checking
            ? "Checking calendar…"
            : reschedule
              ? "Reschedule online"
              : "Skip this occurrence online"
        }
        disabled={locked || (reschedule && date === choice.chore.dueDate)}
        onPress={() => {
          if (reschedule) void check(date, () => submit(date));
          else submit();
        }}
      />
      <NativeAction label="Cancel" disabled={locked} onPress={dismiss} />
    </Card>
  );
}
