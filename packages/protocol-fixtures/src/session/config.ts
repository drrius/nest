export interface SessionConfig {
  readonly supabaseUrl: string;
  readonly publishableKey: string;
  readonly apiUrl: string;
}

function origin(input: string, development: boolean) {
  const url = new URL(input);
  const local =
    development && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) throw new Error("HTTPS required");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new Error("Origin required");
  return url.href;
}

export function sessionConfig(
  input: Partial<SessionConfig>,
  development: boolean,
): SessionConfig | null {
  if (!input.supabaseUrl || !input.publishableKey || !input.apiUrl) return null;
  if (!input.publishableKey.startsWith("sb_publishable_"))
    throw new Error("Publishable key required");
  return {
    supabaseUrl: origin(input.supabaseUrl, development),
    apiUrl: origin(input.apiUrl, development),
    publishableKey: input.publishableKey,
  };
}
