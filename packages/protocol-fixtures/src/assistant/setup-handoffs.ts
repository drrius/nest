import * as Schema from "effect/Schema";
import {
  SetupHandoff,
  NotificationSetupHandoff,
  AccountSettingsHandoff,
} from "@nest/contracts/setup";

const SetupOutput = Schema.Struct({ ok: Schema.Literal(true), value: SetupHandoff });
const AccountOutput = Schema.Struct({ ok: Schema.Literal(true), value: AccountSettingsHandoff });
const NotificationOutput = Schema.Struct({
  ok: Schema.Literal(true),
  value: NotificationSetupHandoff,
});

export function setupHandoff(part: { state?: unknown; output?: unknown }) {
  if (part.state !== "output-available" || !Schema.is(SetupOutput)(part.output)) return null;
  return { label: "Continue your setup on your iPhone", href: "/setup" as const };
}

export function accountSettingsHandoff(part: { state?: unknown; output?: unknown }) {
  if (part.state !== "output-available" || !Schema.is(AccountOutput)(part.output)) return null;
  return { label: "Review your account or sign out on your iPhone", href: "/settings" as const };
}

export function notificationSetupHandoff(part: { state?: unknown; output?: unknown }) {
  if (part.state !== "output-available" || !Schema.is(NotificationOutput)(part.output)) return null;
  return {
    label: "Review notification permission and devices on your iPhone",
    href: "/notification-preferences" as const,
  };
}
