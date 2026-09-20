import type { AssistantAction } from "@nest/contracts/assistant-actions";
export function mealWriteTools<T>(write: (name: AssistantAction, description: string) => T) {
  return {
    removeMeal: write(
      "removeMeal",
      "Remove only a meal the member explicitly asks to remove. Read the current week first and use its entry ID, Monday and exact revision. Ask if the target is ambiguous. History and existing groceries are retained; open linked preparation is skipped. Active leftovers may prevent source removal: do not remove other meals automatically. Never use removal plus placement to bypass generated-plan approval. Reconcile an uncertain original invocation instead of issuing a new command. A receipt confirms the original removal; read again before describing the current week.",
    ),
    placeMeal: write(
      "placeMeal",
      "Add only a specific one-off meal the member explicitly asked to save to a clear date and breakfast/lunch/dinner slot. Ask if the meal, date or slot is unclear. Read readMealWeek fresh first and use its exact Monday and revision; the slot must be empty. Never use this action to save generated suggestions or a generated week: those require a separate visible proposal and explicit approval. It creates no saved recipe, leftovers, groceries or financial obligation. Do not replace an occupied meal or overwrite a conflict. On an uncertain result, reconcile the original journaled invocation, never issue a replacement create. A replayed receipt confirms the original placement; read the week again before describing its current contents.",
    ),
  };
}
