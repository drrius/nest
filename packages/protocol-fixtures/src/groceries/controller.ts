import { controllerPool } from "../offline/controller-pool.ts";
import type { OfflineAccount } from "../offline/owner.ts";
import { groceryFlow } from "./flow.ts";
import { groceryRuntime, type GroceryView } from "./runtime.ts";
import type { GroceryClient } from "./client.ts";
const subscribe = controllerPool<GroceryView, ReturnType<typeof groceryRuntime>>();
export const groceryController = (
  account: OfflineAccount,
  client: GroceryClient,
  publish: (view: GroceryView) => void,
  onQueued: () => void,
) =>
  subscribe(
    account,
    (emit) => groceryRuntime(groceryFlow(account, client), emit, onQueued),
    publish,
  );
