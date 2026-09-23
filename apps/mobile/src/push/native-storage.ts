import { pushRotationCheckpoint } from "./rotation-checkpoint";
import { nativePushDigest } from "./digest";
import type { Account } from "../offline/contracts";
import { randomUUID } from "expo-crypto";
import { protectedPushInstallation, readPushInstallation } from "./installation";
import * as SecureStore from "expo-secure-store";
import { protectedPushAttempts, type PushProtectedDisk } from "./protected-attempt";
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
// Shared singleton: concurrent screens must not create separate read/write queues.
// SecureStore failures propagate; there is deliberately no plaintext fallback.
const disk: PushProtectedDisk = {
  getItem: (key) => SecureStore.getItemAsync(key, options),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, options),
  removeItem: (key) => SecureStore.deleteItemAsync(key, options),
};

export const nativePushAttempts = protectedPushAttempts(disk);
export const nativePushInstallation = protectedPushInstallation(disk, randomUUID);

export const readNativePushInstallation = () => readPushInstallation(disk);

export const nativePushCheckpoint = (account: Account) =>
  pushRotationCheckpoint({ account, disk, hash: nativePushDigest });
