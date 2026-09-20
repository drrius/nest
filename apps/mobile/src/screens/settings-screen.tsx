import { useRouter } from "expo-router";
import { useSession } from "../session/provider";
import { Page, Card, Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { SignInCard } from "../components/sign-in-card";
export default function SettingsScreen() {
  const session = useSession(),
    router = useRouter();
  if (session.state.status !== "ready")
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  return (
    <Page>
      <Card>
        <Section title="Personal" />
        <Note>Your dietary preferences, optional calorie goal and portions.</Note>
        <NativeAction
          label="Your food preferences"
          onPress={() => router.push("/food-preferences")}
        />
      </Card>
      <Card>
        <Section title="Calendar" />
        <Note>Choose calendars on this iPhone and opt in to share busy times.</Note>
        <NativeAction
          label="Calendar access and sharing"
          onPress={() => router.push("/calendar-sharing")}
        />
      </Card>
      <Card>
        <Section title="Private memory" />
        <Note>Review and confirm what Nest may remember for you.</Note>
        <NativeAction label="Manage private memory" onPress={() => router.push("/memory")} />
      </Card>
      <Card>
        <Section title="Household" />
        <Note>Cooking choices and meal slots shared with your partner.</Note>
        <NativeAction
          label="Cooking preferences"
          onPress={() => router.push("/cooking-preferences")}
        />
      </Card>
      <NativeAction label="Household account" onPress={() => router.push("/")} />
    </Page>
  );
}
