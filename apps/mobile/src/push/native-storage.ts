import * as SecureStore from "expo-secure-store";
import { protectedPushAttempts } from "./protected-attempt";
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
// Shared singleton: concurrent screens must not create separate read/write queues.
// SecureStore failures propagate; there is deliberately no plaintext fallback.
export const nativePushAttempts = protectedPushAttempts({
  getItem: (key) => SecureStore.getItemAsync(key, options),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, options),
  removeItem: (key) => SecureStore.deleteItemAsync(key, options),
});
