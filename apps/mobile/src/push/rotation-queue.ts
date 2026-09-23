import type { PreferenceFailure } from "../preferences/client.ts";
import * as Effect from "effect/Effect";
// Tokens remain volatile until the authorized operation stages protected intent.
// Background events wait for an explicit foreground transition; failures retain
// the latest event without an unbounded retry loop.
export function pushRotationQueue<T>(deps: {
  active: () => boolean;
  rotate: (token: T, current: () => boolean) => Effect.Effect<string, PreferenceFailure>;
}) {
  let pending: T | null = null;
  let busy = false;
  let disposed = false;
  const lifetime = new AbortController();
  const current = () => !disposed && deps.active();
  const drain = async () => {
    if (!current() || busy || pending === null) return;
    const token = pending;
    busy = true;
    try {
      const outcome = await Effect.runPromise(deps.rotate(token, current), {
        signal: lifetime.signal,
      });
      if (current() && outcome !== "pending" && pending === token) pending = null;
    } catch {
      // No token or transport error is logged. Retry on the next foreground/event.
    } finally {
      busy = false;
      if (pending !== null && pending !== token) void drain();
    }
  };
  return {
    changed: (token: T) => {
      if (disposed) return;
      pending = token;
      void drain();
    },
    foreground: () => {
      void drain();
    },
    dispose: () => {
      disposed = true;
      pending = null;
      lifetime.abort();
    },
  };
}
