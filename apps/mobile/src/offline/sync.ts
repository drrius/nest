import * as Effect from "effect/Effect";
export interface SyncView {
  syncing: boolean;
  stale: boolean;
  error: string | null;
  notice: string | null;
  access: "allowed" | "verify";
}

type SyncPorts = {
  run: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
  read: () => Promise<void>;
  emit: (patch: Partial<SyncView>) => void;
  disposed: () => boolean;
};
function syncFailure(error: unknown): Partial<SyncView> {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  const verify = code === "session" || code === "forbidden";
  return {
    stale: true,
    ...(verify ? { access: "verify" as const } : {}),
    error: verify
      ? "Your account needs to be verified again. Saved changes are kept."
      : "Could not sync. Saved changes are kept; try again when connected.",
  };
}
export function syncOfflineFlow<E>(
  flow: { sync: Effect.Effect<string | null, E> },
  { run, read, emit, disposed }: SyncPorts,
) {
  let active: Promise<void> | null = null;
  let again = false;
  const cycle = async () => {
    emit({ syncing: true, error: null });
    try {
      do {
        again = false;
        await read();
        const notice = await run(flow.sync);
        emit({ stale: false, notice, access: "allowed" });
        await read();
      } while (again && !disposed());
    } catch (error) {
      emit(syncFailure(error));
      await read().catch(() =>
        emit({ error: "Could not read saved household data. Please try again." }),
      );
    } finally {
      emit({ syncing: false });
    }
  };
  return () => {
    if (disposed()) return Promise.resolve();
    if (active) {
      again = true;
      return active;
    }
    active = cycle().finally(() => {
      active = null;
    });
    return active;
  };
}
