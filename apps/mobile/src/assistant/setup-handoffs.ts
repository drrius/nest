import * as Schema from "effect/Schema";
import { SetupHandoff, NotificationSetupHandoff } from "@nest/contracts/setup";

const SetupOutput = Schema.Struct({ ok: Schema.Literal(true), value: SetupHandoff });
const NotificationOutput = Schema.Struct({
  ok: Schema.Literal(true),
  value: NotificationSetupHandoff,
});

export function setupHandoff(part: { state?: unknown; output?: unknown }) {
  if (part.state !== "output-available" || !Schema.is(SetupOutput)(part.output)) return null;
  return { label: "Continue your setup on your iPhone", href: "/setup" as const };
}

export function notificationSetupHandoff(part: { state?: unknown; output?: unknown }) {
  if (part.state !== "output-available" || !Schema.is(NotificationOutput)(part.output)) return null;
  return {
    label: "Review notification permission and devices on your iPhone",
    href: "/notification-preferences" as const,
  };
}
