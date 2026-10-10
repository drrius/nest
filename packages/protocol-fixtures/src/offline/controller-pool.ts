// All mounted consumers of one feature/account share its serialized sync cycle.
// Account objects are replaced with the SQLite lease, never reused across users.
export function controllerPool<View, Controller extends { dispose(): void }>() {
  type Entry = {
    controller: Controller;
    listeners: Set<(view: View) => void>;
    state: { latest?: View };
  };
  const entries = new WeakMap<object, Entry>();
  return (
    account: object,
    create: (publish: (view: View) => void) => Controller,
    listener: (view: View) => void,
  ) => {
    let entry = entries.get(account);
    if (!entry) {
      const listeners = new Set<(view: View) => void>();
      const state: { latest?: View } = {};
      const created: Entry = {
        listeners,
        state,
        controller: create((view) => {
          state.latest = view;
          for (const subscriber of listeners) subscriber(view);
        }),
      };
      entry = created;
      entries.set(account, entry);
    }
    const owned = entry;
    owned.listeners.add(listener);
    if (owned.state.latest !== undefined) listener(owned.state.latest);
    return {
      controller: owned.controller,
      release() {
        if (!owned.listeners.delete(listener) || owned.listeners.size) return;
        owned.controller.dispose();
        entries.delete(account);
      },
    };
  };
}
