import type { Connectivity } from "./reconnect";
type Listener = (state: Connectivity) => void;
// Keep the native monitor alive across account switches: the pinned iOS module
// cancels its single NWPathMonitor when its last native listener is removed.
// Only current subscribers are retained; an idle hub performs no account work.
export function connectivityHub(start: (listener: Listener) => { remove(): void }) {
  const listeners = new Set<Listener>();
  let subscription: { remove(): void } | undefined;
  return (listener: Listener) => {
    listeners.add(listener);
    try {
      subscription ??= start((state) => {
        for (const current of listeners) current(state);
      });
    } catch (error) {
      listeners.delete(listener);
      throw error;
    }
    return {
      remove: () => {
        listeners.delete(listener);
      },
    };
  };
}
