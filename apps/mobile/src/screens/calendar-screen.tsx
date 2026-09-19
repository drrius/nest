import { useState } from "react";
import { Card, Note, Page, Section } from "../components/page";
import { NativeAction } from "../components/native-action";

export default function CalendarScreen() {
  const [showChores, setShowChores] = useState(true);
  return (
    <Page>
      <Note>Design preview · These are fictional events, not device calendar data.</Note>
      <Section title="Monday, 21 September">
        <Card>
          <Note>09:00–10:00 · Your calendar</Note>
          <Note>Team catch-up</Note>
          <Note>Personal event details stay on your iPhone.</Note>
        </Card>
        <Card>
          <Note>14:00–15:30 · Partner busy</Note>
          <Note>Only this time block is shared.</Note>
        </Card>
        {showChores ? (
          <Card>
            <Note>18:00 · Household chore</Note>
            <Note>Water the plants</Note>
          </Card>
        ) : null}
      </Section>
      <NativeAction
        label={showChores ? "Hide chore layer" : "Show chore layer"}
        onPress={() => setShowChores(!showChores)}
      />
      <Note>
        Outside a shared snapshot’s covered range, availability is unknown. Calendar access and
        sharing will be optional.
      </Note>
    </Page>
  );
}
