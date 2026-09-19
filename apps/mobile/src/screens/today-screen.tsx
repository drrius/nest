import { Link } from "expo-router";
import { Card, Note, Page, Section } from "../components/page";
import { CheckRow } from "../components/check-row";
import { NativeAction } from "../components/native-action";
import { usePreview } from "../preview/preview-state";
import { useQuiet } from "../theme";

export default function TodayScreen() {
  const state = usePreview();
  const colors = useQuiet();
  const chores = state.everyone
    ? state.chores
    : state.chores.filter((item) => item.id !== "recycling");
  return (
    <Page>
      <Note>Design preview · Fictional household</Note>
      <NativeAction
        label={state.everyone ? "Everyone · Show me + shared" : "Me + shared · Show everyone"}
        onPress={() => state.setEveryone(!state.everyone)}
      />
      <Section title="A few things for today">
        <Card>
          {chores.map((item) => (
            <CheckRow
              key={item.id}
              item={item}
              completionOnly
              onPress={() => state.completeChore(item.id)}
            />
          ))}
        </Card>
      </Section>
      <Section title="Tonight">
        <Card>
          <Note>Roasted tomato pasta · 2 portions</Note>
          <Note>A simple dinner, about 25 minutes.</Note>
        </Card>
      </Section>
      <Link href="/groceries" style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}>
        Open groceries
      </Link>
    </Page>
  );
}
