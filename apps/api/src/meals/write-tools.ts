import type { AssistantAction } from "@nest/contracts/assistant-actions";
export function mealWriteTools<T>(write: (name: AssistantAction, description: string) => T) {
  return {
    createMealPreparation: write(
      "createMealPreparation",
      "Create one preparation task only for an existing meal the member explicitly requests. Read the current meal week and readMealPreparation first; use that exact entry, Monday and revision. Ask for an unclear task title or due date. Preserve supplied instructions; null means no instructions. Responsibility defaults to shared unless explicitly assigned or alternating; use readRoutines for real member IDs. Never recreate an existing or completed preparation. This creates one date-only household task, not a recurring routine, calendar event, financial obligation or reminder consent. Do not invent a time or claim the date is free. A receipt confirms original creation; readMealPreparation again for current status after later household changes. Reconcile the original invocation after uncertainty instead of creating again.",
    ),
    placeLeftovers: write(
      "placeLeftovers",
      "Plan leftovers only from an original meal the member explicitly requests, for an unambiguous empty slot on a strictly later day. Read both source and destination weeks fresh and use their exact Monday/revision pairs; a same-week request uses one matching revision. Ask when source or destination is unclear. Preserve the source's retained recipe; unknown historical ingredients stay unknown. This creates no groceries or preparation and does not change the source meal. Never create leftover chains, remove other meals to bypass conflicts, or use this action to approve generated plans. Reconcile an uncertain original invocation instead of issuing another command. Reread both weeks before describing current contents.",
    ),
    placeRecipe: write(
      "placeRecipe",
      "Place only a saved recipe explicitly selected by the member into an unambiguous empty date and breakfast/lunch/dinner slot. Read the current week, library and exact recipe detail first and use both exact revisions. Preserve recipe identity and ingredients as planned. Do not invent missing metadata, add groceries, create leftovers or save generated suggestions through this action; generated plans need a separate visible proposal and approval. On uncertainty reconcile the original invocation, never issue another placement. Reread before describing the current week.",
    ),
    replaceWithRecipe: write(
      "replaceWithRecipe",
      "Replace only an unambiguous existing meal with a saved recipe the member explicitly requests. Read the week, current library and exact recipe detail first; use the original entry ID and both exact revisions. Explain that old history and groceries remain, open linked preparation is skipped and the new meal starts without preparation. Active leftovers can prevent replacement; never remove dependent meals automatically. Capture recipe identity and ingredients as planned. Do not add groceries or bypass generated-plan approval. Never emulate replacement with separate remove/place calls; reconcile uncertain original invocations.",
    ),
    editRecipe: write(
      "editRecipe",
      "Edit only a saved recipe the member explicitly requests. Read the current library and exact recipe detail first; ask when the target or changes are ambiguous. Preserve unspecified metadata, unknown servings/instructions and existing ingredient identities, quantities, units and categories. Omit untouched patch fields; ingredients:null preserves the list, while a supplied list is the complete desired ordered selection and archives omitted ingredients. Use existing IDs with minimal patches for retained ingredients and new entries only for requested additions. Never infer missing recipe information. This changes only the library, not existing planned meals or groceries, and cannot approve a generated plan. On native_required open the library's native editor; nothing was saved. Reconcile an uncertain original invocation instead of issuing a new edit. A receipt confirms the original edit; reread before describing current contents.",
    ),
    archiveRecipe: write(
      "archiveRecipe",
      "Archive only a saved recipe the member explicitly asks to hide from the household library. Read the current library and exact recipe revision first; ask when the target is ambiguous. Explain that ingredients, existing planned meals, history and groceries are retained. This does not remove a planned meal, delete history or approve a generated plan. Reconcile an uncertain original invocation instead of issuing a new archive. A receipt confirms the original archive; reread before describing the current library because later household changes may have restored the recipe.",
    ),
    createRecipe: write(
      "createRecipe",
      "Save only a complete recipe the member explicitly asks to keep in the household library. Read the current library revision first. Require a title, known servings, ingredients and cooking instructions; ask for missing information instead of inventing it. Preserve separate quantities, units and ingredient order. This does not place meals or add groceries and cannot approve generated meal plans. Large recipes must use the native recipe form when native_required is returned; nothing was saved in that case. On uncertainty reconcile the original invocation; never create a second recipe. Reread before describing current recipe contents.",
    ),
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
