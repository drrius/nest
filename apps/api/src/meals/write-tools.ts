import type { AssistantAction } from "@nest/contracts/assistant-actions";
export function mealWriteTools<T>(write: (name: AssistantAction, description: string) => T) {
  return {
    replaceMeal: write(
      "replaceMeal",
      "Replace only an existing meal with a named one-off meal the member explicitly requests. Read the week fresh and identify the exact original entry, date, slot, Monday and revision; ask when ambiguous. Replacing retains the original history and existing groceries, skips any open linked preparation, and creates a distinct new entry without recipe, ingredients or preparation. Explain these consequences. Active leftovers can prevent replacement; never remove dependent meals automatically. Never save generated suggestions or bypass generated-plan approval through replacement. Never emulate replacement with separate remove and place calls. Reconcile an uncertain original invocation rather than issue a new command. Reread the week before describing its current contents after a receipt.",
    ),
    moveMeal: write(
      "moveMeal",
      "Move only an existing meal the member explicitly asks to move to a clear date and breakfast/lunch/dinner slot. Ask when the entry or destination is ambiguous. Read both source and destination weeks fresh first, using their exact Mondays and revisions; use one matching revision for a same-week move. The destination must be empty. Ingredients, instructions, groceries and linked preparation dates remain unchanged. Leftover ordering may prevent a move: never move or remove other meals automatically. Never substitute this action for generated-plan approval. Reconcile an uncertain original invocation rather than issue a new command. A receipt confirms the original move; reread both weeks before describing current contents.",
    ),
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
