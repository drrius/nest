import type { pushWorkerRpc } from "./worker-rpc.ts";
/** Separate persisted scan progress; delivery attempts and receipt polling stay shared. */
export function summaryPushRpc(
  rpc: ReturnType<typeof pushWorkerRpc>,
): ReturnType<typeof pushWorkerRpc> {
  return (method, input) => {
    if (method === "readCheckpoint") return rpc("summaryReadCheckpoint", input);
    if (method === "saveCheckpoint") return rpc("summarySaveCheckpoint", input);
    if (method === "scan") return rpc("summaryScan", input);
    return rpc(method, input);
  };
}
