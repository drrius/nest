import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { fetch } from "expo/fetch";
import { protectedStorage, authKey } from "./protected-storage";
import type { SessionConfig } from "./config";

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const protectedSession = protectedStorage({
  getItem: (key) => SecureStore.getItemAsync(key, options),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, options),
  removeItem: (key) => SecureStore.deleteItemAsync(key, options),
});
export const beginLocalLogout = () => protectedSession.beginLogout(true);
export const logoutCredentials = protectedSession.logoutCredentials;
export const beginLocalSignIn = protectedSession.beginSignIn;
export const offlineIdentity = protectedSession.identity;
export function nativeAuth(config: SessionConfig) {
  return createClient(config.supabaseUrl, config.publishableKey, {
    global: { fetch: (input, init) => fetch(input, { ...init, redirect: "error" }) },
    auth: {
      storageKey: authKey,
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      storage: protectedSession.storage,
    },
  }).auth;
}
export function nativeCleanupAuth(config: SessionConfig) {
  return createClient(config.supabaseUrl, config.publishableKey, {
    global: { fetch: (input, init) => fetch(input, { ...init, redirect: "error" }) },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  }).auth;
}
