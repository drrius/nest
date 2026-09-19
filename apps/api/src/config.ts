import type { IdentityConfig } from "./supabase-identity.ts";

export function validateConfig(config: IdentityConfig): IdentityConfig {
  const base = new URL(config.url);
  if (
    base.protocol !== "https:" &&
    !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))
  ) {
    throw new Error("Supabase URL must use HTTPS or local development HTTP");
  }
  if (base.username || base.password || base.search || base.hash || base.pathname !== "/") {
    throw new Error("Supabase URL must be an origin without credentials");
  }
  if (!config.publishableKey.startsWith("sb_publishable_")) {
    throw new Error("Use a Supabase publishable key, never a server secret");
  }
  return { ...config, url: base.href };
}
