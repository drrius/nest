import { useRouter } from "expo-router";
import { Note } from "./page";
import { NativeAction } from "./native-action";

export function ReminderNotificationSetup({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  return (
    <>
      <Note>Choose either person or both. Each recipient’s mute settings apply.</Note>
      <Note>
        To receive reminders on this iPhone, review your notification choices and device permission.
        Your partner manages their own notification settings.
      </Note>
      <NativeAction
        label="Review your notification setup"
        disabled={disabled}
        onPress={() => router.push("/notification-preferences")}
      />
    </>
  );
}
