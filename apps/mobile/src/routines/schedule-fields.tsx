import { Column, Text, Picker, Switch } from "@expo/ui";
import type { ScheduleDraft } from "./draft";
import { weekdays } from "./draft";
const presets = [
  ["one_off", "One time"],
  ["daily", "Every day"],
  ["weekdays", "Selected days"],
  ["weekly", "Weekly"],
  ["biweekly", "Every other week"],
  ["monthly", "Monthly"],
  ["after_completion", "After completion"],
] as const;
type Props = { value: ScheduleDraft; change: (value: ScheduleDraft) => void; enabled: boolean };
export function ScheduleFields({ value, change, enabled }: Props) {
  return (
    <Column spacing={12}>
      <Text>Repeat</Text>
      <Picker
        selectedValue={value.kind}
        onValueChange={(kind) => change({ ...value, kind })}
        enabled={enabled}
      >
        {presets.map(([key, label]) => (
          <Picker.Item key={key} value={key} label={label} />
        ))}
      </Picker>
      {value.kind === "weekdays"
        ? weekdays.map((day, i) => (
            <Switch
              key={day}
              label={day}
              value={value.days.includes(i + 1)}
              disabled={!enabled}
              onValueChange={(checked) =>
                change({
                  ...value,
                  days: checked
                    ? [...value.days, i + 1].sort((a, b) => a - b)
                    : value.days.filter((n) => n !== i + 1),
                })
              }
            />
          ))
        : null}
      {value.kind === "weekly" || value.kind === "biweekly" ? (
        <Picker
          selectedValue={value.weekday}
          onValueChange={(weekday) => change({ ...value, weekday })}
          enabled={enabled}
        >
          {weekdays.map((day, i) => (
            <Picker.Item key={day} value={i + 1} label={day} />
          ))}
        </Picker>
      ) : null}
      {value.kind === "monthly" ? (
        <Picker
          selectedValue={value.dayOfMonth}
          onValueChange={(dayOfMonth) => change({ ...value, dayOfMonth })}
          enabled={enabled}
        >
          {Array.from({ length: 31 }, (_, i) => (
            <Picker.Item key={i} value={i + 1} label={`Day ${i + 1}`} />
          ))}
        </Picker>
      ) : null}
    </Column>
  );
}
