import Foundation

struct SavedProposalApproval: Codable, Equatable, Sendable {
    enum State: String, Codable, Sendable { case pending, acknowledged, conflict }
    let preview: MealProposalEnvelope
    let command: ApproveMealProposal
    var state: State
    var receipt: MealProposalApprovalReceipt?

    func validated(_ lease: OfflineLease) throws -> Self {
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        _ = try preview.validated(member: member, id: command.proposalId)
        _ = try command.validated(against: preview.proposal)
        guard (state == .acknowledged) == (receipt != nil) else { throw OfflineFailure.storage }
        _ = try receipt?.validated(member: member, command: command, proposal: preview.proposal)
        return self
    }
}

extension ChoreOfflineStore {
    func readProposalApproval(lease: OfflineLease) throws -> SavedProposalApproval? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM proposal_approvals WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedProposalApproval.self, from: data).validated(lease)
    }

    func enqueueProposalApproval(
        preview: MealProposalEnvelope, operation: UUID, lease: OfflineLease,
        now: Date = .now
    ) throws {
        try authorize(lease)
        guard try readProposalApproval(lease: lease) == nil,
            try readProposalDiscard(lease: lease) == nil,
            try readProposalEdit(lease: lease) == nil,
            try readProposalGeneration(lease: lease)?.envelope == preview
        else { throw OfflineFailure.missingSnapshot }
        let command = try ApproveMealProposal(proposal: preview.proposal, operation: operation, now: now)
        let saved = try SavedProposalApproval(preview: preview, command: command, state: .pending).validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO proposal_approvals(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func acknowledgeProposalApproval(_ receipt: MealProposalApprovalReceipt, lease: OfflineLease) throws {
        guard var saved = try readProposalApproval(lease: lease), saved.state == .pending else {
            throw OfflineFailure.invalidOperation
        }
        saved.state = .acknowledged
        saved.receipt = receipt
        try writeProposalApproval(saved, lease: lease)
    }

    func conflictProposalApproval(operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readProposalApproval(lease: lease), saved.state == .pending,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        saved.state = .conflict
        try writeProposalApproval(saved, lease: lease)
    }

    func discardConflictedProposalApproval(lease: OfflineLease) throws {
        guard try readProposalApproval(lease: lease)?.state == .conflict else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM proposal_approvals WHERE actor=? AND household=?", lease.scope)
    }

    func clearConfirmedProposalApproval(lease: OfflineLease) throws {
        guard let saved = try readProposalApproval(lease: lease), let receipt = saved.receipt,
            let current = try readProposalGeneration(lease: lease)?.envelope,
            current.proposal.id == receipt.proposalId, current.proposal.status == .approved,
            current.proposal.revision == receipt.revision,
            current.proposal.entries == saved.preview.proposal.entries
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM proposal_approvals WHERE actor=? AND household=?", lease.scope)
    }

    private func writeProposalApproval(_ saved: SavedProposalApproval, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE proposal_approvals SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }
}
