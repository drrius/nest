import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { fetch } from "expo/fetch";
import type { SessionConfig } from "./config";

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export function nativeAuth(config: SessionConfig) {
  return createClient(config.supabaseUrl, config.publishableKey, {
    global: { fetch: (input, init) => fetch(input, { ...init, redirect: "error" }) },
    auth: {
      storageKey: "nest.auth.v1",
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      storage: {
        getItem: (key) => SecureStore.getItemAsync(key, options),
        setItem: (key, value) => SecureStore.setItemAsync(key, value, options),
        removeItem: (key) => SecureStore.deleteItemAsync(key, options),
      },
    },
  }).auth;
}
