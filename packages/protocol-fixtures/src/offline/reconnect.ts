export interface Connectivity {
  isConnected?: boolean;
  isInternetReachable?: boolean;
}
export interface ReconnectPorts {
  active: boolean;
  onActivity: (listener: (active: boolean) => void) => { remove(): void };
  onNetwork: (listener: (network: Connectivity) => void) => { remove(): void };
  network: () => Promise<Connectivity>;
  refresh: () => Promise<void>;
}
// Connectivity only prompts authorized sync. It never proves API reachability
// or authorizes an operation, and retained online edits are not part of refresh.
export function reconnectSync(ports: ReconnectPorts) {
  let disposed = false,
    active = ports.active,
    online: boolean | undefined,
    observed = false;
  const refresh = () => {
    if (active && !disposed) void ports.refresh().catch(() => undefined);
  };
  const activity = ports.onActivity((next) => {
    const resumed = !active && next;
    active = next;
    if (resumed) refresh();
  });
  let network: { remove(): void } | undefined;
  try {
    network = ports.onNetwork((state) => {
      observed = true;
      const next = connected(state);
      if (next && online !== true) refresh();
      online = next;
    });
  } catch {
    /* Foreground/manual sync remains usable if the native monitor fails. */
  }
  void ports
    .network()
    .then((state) => {
      if (!disposed && !observed) online = connected(state);
    })
    .catch(() => undefined);
  refresh();
  return () => {
    if (disposed) return;
    disposed = true;
    activity.remove();
    network?.remove();
  };
}
const connected = (state: Connectivity) =>
  state.isConnected === true && state.isInternetReachable !== false;
