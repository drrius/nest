import type { AssistantAction } from "@nest/contracts/assistant-actions";
export function financialProposalTools<T>(
  write: (name: AssistantAction, description: string) => T,
) {
  return {
    proposeCorrection: write(
      "proposeCorrection",
      "Propose only a correction the member explicitly requested. First read the known entry with readCorrectionContext; never invent its source ID, member IDs or reviewed reversal ID. Set expectedReversalId to the current source reversal ID, including null. A null replacement means reverse without replacement; request explicit intent. Expense/replacement corrections can provide kind expense with exact description, amount, payer, allocations, date, category and note. Preserve and review grocery receipt total separately from shared amount. Opening repairs use kind opening_balance with an explicit creditor and no expense allocations. Active refunds must be reversed before their source is corrected; a reversed opening leaf may be repaired, but ancestors cannot fork. Ask for missing values; never infer consent. This only creates a private pending proposal, posts no money and requires separate native confirmation. Original history and receipt references are retained. Never call Save, execute or decision endpoints yourself. Changed source state needs a fresh proposal and review.",
    ),
    proposeRefund: write(
      "proposeRefund",
      "Propose only a refund the member explicitly asked to record as already received outside Nest. Read the original expense/replacement using readRefundContext first. Bind its known source ID, original payer and exact current remaining shares; never invent identities or refund unavailable/reversed sources. Ask for missing date, amount and per-person refund allocations; each allocation must fit that member's remaining share and both sum to the positive CHF centime amount. Full refund means all remaining shares, only when explicitly requested. This creates a private pending proposal and posts no money. A separate native confirmation is required. Never infer consent or call Save, execute or decision endpoints yourself. A changed source or remaining share requires a fresh proposal and review.",
    ),
    proposeSettlement: write(
      "proposeSettlement",
      "Propose only a settlement the member explicitly asked to record. Read the current Money balance first. Bind its exact positive outstanding CHF centime string, current debtor as payer and creditor as recipient. Full mode uses exactly that amount; partial mode needs an explicit positive amount no larger than the outstanding balance. Ask for missing date or amount; never invent member IDs. This creates a private proposal and posts no money. Confirmation is a separate native action; never infer consent or call native Save/decision endpoints. A changed balance requires fresh review. This records an entered settlement, never initiates or proves a bank transfer.",
    ),
    proposeExpense: write(
      "proposeExpense",
      "Propose only an expense the member explicitly asked to record. Read household member IDs first; never invent them. Ask for missing amount, payer, date or split. Use exact CHF centime strings and exactly two member allocations summing to the amount; equal splits assign an odd centime to the payer. Category is null unless a current category ID is known; note is null when absent. This creates a private pending proposal and posts no money. Tell the member to open the expense approval and confirm its exact amount, payer and allocations. Never claim it is posted, infer consent from conversation, or try to approve or execute it yourself. For an explicitly requested grocery expense, ask separately for the receipt total and shared amount. Set receiptTotalCentimes to the explicit total and amountCentimes to the shared amount, with allocations summing only to that shared amount. The shared amount cannot exceed the total. Omit receiptTotalCentimes for ordinary expenses. Checking groceries never implies an expense or provides either amount. Receipt selection requires a native handoff and is not included in this proposal.",
    ),
  };
}
