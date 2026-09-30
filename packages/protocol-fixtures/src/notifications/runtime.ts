import {
  SaveNotificationPreferences,
  type NotificationPreferences,
} from "@nest/contracts/notifications";
import { PreferenceRuntime } from "../preferences/runtime.ts";
import type { PreferenceView } from "../preferences/contracts.ts";
import type { NotificationClient } from "./client.ts";
export type NotificationView = PreferenceView<NotificationPreferences>;
export class NotificationRuntime extends PreferenceRuntime<NotificationPreferences> {
  constructor(client: NotificationClient, uuid: () => string) {
    super(client, uuid, SaveNotificationPreferences, (preferences) => ({
      ...preferences,
    }));
  }
}
