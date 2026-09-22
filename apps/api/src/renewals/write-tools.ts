import type { AssistantAction } from "@nest/contracts/assistant-actions";
export function renewalWriteTools<T>(write: (name: AssistantAction, description: string) => T) {
  return {
    createRenewal: write(
      "createRenewal",
      "Create only a renewal the user explicitly requests. Ask for unclear title, renewal date or cancellation notice in days (0–730). Responsibility and linked recurring expense are optional; use readHouseholdRoster and current recurring reads for exact IDs, never invent them. State the selected fields before acting. This records a renewal only: it does not cancel a contract, modify a mandate, write financial history or enable reminders. The server supplies operation and renewal IDs. Reconcile the original invocation on uncertainty; never create a duplicate.",
    ),
    editRenewal: write(
      "editRenewal",
      "Edit only an explicitly requested renewal. Read it fresh with readRenewal and send its exact ID/revision; preserve every unspecified field in the full fields object. Resolve requested member/link choices from authorized reads. State changed fields before acting. Do not overwrite a conflict: reread and ask. This changes no contract, mandate, ledger or reminder consent. Reconcile uncertain outcomes through the original invocation.",
    ),
    removeRenewal: write(
      "removeRenewal",
      "Remove only the exact renewal the user explicitly asks to remove from Nest. Read its current ID/revision first and explain that removal retains history and does not cancel the contract or linked expense. Clarify ambiguous cancel requests. Never remove a recurring rule or write financial history. On conflict reread and ask; on uncertainty reconcile the original invocation.",
    ),
  };
}
