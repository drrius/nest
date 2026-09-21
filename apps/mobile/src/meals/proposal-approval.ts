import type { MealProposal, MealProposalApprovalReceipt } from "@nest/contracts/meal-proposals";

export function matchesApprovedPreview(
  proposal: MealProposal,
  receipt: MealProposalApprovalReceipt,
) {
  return (
    receipt.proposalId === proposal.proposalId &&
    receipt.weekStart === proposal.weekStart &&
    receipt.previousWeekRevision === proposal.weekRevision &&
    receipt.approvedRevision === proposal.revision &&
    proposal.entries !== null &&
    receipt.entries.length === proposal.entries.length &&
    receipt.entries.every((posted) =>
      proposal.entries?.some(
        (entry) =>
          entry.entryId === posted.proposalEntryId &&
          entry.date === posted.date &&
          entry.slot === posted.slot,
      ),
    )
  );
}
