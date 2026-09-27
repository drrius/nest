import { Host } from "@expo/ui";
import { DatePicker } from "@expo/ui/swift-ui";
import { datePickerStyle, disabled, frame } from "@expo/ui/swift-ui/modifiers";
import { useRouter } from "expo-router";
import { Note } from "../components/page";
import { agendaDay, localDate } from "./agenda-day";
import type { AgendaView } from "./agenda-runtime";

export function AgendaDate({ view }: { view: AgendaView }) {
  const router = useRouter();
  const window = agendaDay(view.date);
  if (!window) return <Note>{view.date}</Note>;
  return (
    <Host matchContents>
      <DatePicker
        selection={new Date(window.start)}
        displayedComponents={["date"]}
        modifiers={[datePickerStyle("compact"), disabled(view.busy), frame({ minHeight: 44 })]}
        onDateChange={(date) => router.setParams({ date: localDate(date) })}
      />
    </Host>
  );
}
