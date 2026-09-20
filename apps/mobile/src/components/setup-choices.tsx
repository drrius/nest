import { useRouter } from "expo-router";
import type { SetupStatus } from "@nest/contracts/setup";
import { Card, Note, Section } from "./page";
import { NativeAction } from "./native-action";
const configured = (value: boolean | undefined) =>
  value === undefined
    ? "Saved status not checked."
    : value
      ? "Preferences saved. You can edit them any time."
      : "No preferences saved yet.";
export function SetupChoices({ status }: { status: SetupStatus | null }) {
  const router = useRouter();
  return (
    <>
      <Card>
        <Section title="Your food preferences" />
        <Note>{configured(status?.foodConfigured)}</Note>
        <Note>
          Dietary restrictions and dislikes guide household meal plans. Optional calorie goals stay
          private and guide estimates, not tracking.
        </Note>
        <NativeAction
          label="Set up your food preferences"
          onPress={() => router.push("/food-preferences")}
        />
      </Card>
      <Card>
        <Section title="Household cooking" />
        <Note>{configured(status?.cookingConfigured)}</Note>
        <Note>
          Cooking notes and visible meal slots are shared. Either partner can change them.
        </Note>
        <NativeAction
          label="Set up household cooking"
          onPress={() => router.push("/cooking-preferences")}
        />
      </Card>
      <Card>
        <Section title="Your notifications" />
        <Note>{configured(status?.notificationsConfigured)}</Note>
        <Note>
          Choose a daily summary and item reminders, or keep both off. Saved choices do not prove
          iPhone permission or delivery.
        </Note>
        <NativeAction
          label="Set up your notifications"
          onPress={() => router.push("/notification-preferences")}
        />
      </Card>
      <Card>
        <Section title="Calendar · optional" />
        <Note>
          Review access on this iPhone. Personal event details stay on-device; only busy times are
          shared if you opt in. You can continue without calendar access.
        </Note>
        <NativeAction
          label="Review calendar access and sharing"
          onPress={() => router.push("/calendar-sharing")}
        />
      </Card>
      <Card>
        <Section title="Private memory · optional" />
        <Note>
          Save nothing by default. Inspect, confirm or remove what you explicitly choose to let Nest
          remember.
        </Note>
        <NativeAction label="Review private memory" onPress={() => router.push("/memory")} />
      </Card>
    </>
  );
}
