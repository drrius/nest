import { useRouter } from "expo-router";
import { Section } from "../components/page";
import { NativeAction } from "../components/native-action";

export function TodayAddActions() {
  const router = useRouter();
  return (
    <Section title="Add">
      <NativeAction
        label="Chore"
        onPress={() => router.push({ pathname: "/routines", params: { action: "create" } })}
      />
      <NativeAction label="Grocery" onPress={() => router.push("/grocery-edit")} />
      <NativeAction label="Expense" onPress={() => router.push("/expense-entry")} />
    </Section>
  );
}
