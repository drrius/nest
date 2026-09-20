import type { AssistantAction } from "@nest/contracts/assistant-actions";
export function mealWriteTools<T>(write: (name: AssistantAction, description: string) => T) {
  return {
    placeMeal: write(
      "placeMeal",
      "Add only a specific one-off meal the member explicitly asked to save to a clear date and breakfast/lunch/dinner slot. Ask if the meal, date or slot is unclear. Read readMealWeek fresh first and use its exact Monday and revision; the slot must be empty. Never use this action to save generated suggestions or a generated week: those require a separate visible proposal and explicit approval. It creates no saved recipe, leftovers, groceries or financial obligation. Do not replace an occupied meal or overwrite a conflict. On an uncertain result, reconcile the original journaled invocation, never issue a replacement create. A replayed receipt confirms the original placement; read the week again before describing its current contents.",
    ),
  };
}
