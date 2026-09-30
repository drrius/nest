import { controllerPool } from "../offline/controller-pool.ts";
import type { OfflineAccount } from "../offline/owner.ts";
import { choreFlow } from "./flow.ts";
import { choreRuntime, type ChoreView } from "./runtime.ts";
import type { ChoreClient } from "./client.ts";
const subscribe = controllerPool<ChoreView, ReturnType<typeof choreRuntime>>();
export const choreController = (
  account: OfflineAccount,
  client: ChoreClient,
  publish: (view: ChoreView) => void,
  onQueued: () => void,
) =>
  subscribe(
    account,
    (emit) => choreRuntime(choreFlow(account.store, account.session, client), emit, onQueued),
    publish,
  );
