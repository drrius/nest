import Foundation

struct SavedProposalDiscard: Codable, Equatable, Sendable {
    enum State: String, Codable, Sendable { case pending, acknowledged, conflict }
    let preview: MealProposalEnvelope
    let command: DiscardMealProposal
    var state: State
    var receipt: MealProposalDiscardReceipt?

    func validated(_ lease: OfflineLease) throws -> Self {
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        _ = try preview.validated(member: member, id: command.proposalId)
        guard try DiscardMealProposal(proposal: preview.proposal, operation: command.operationId) == command
        else { throw OfflineFailure.storage }
        guard (state == .acknowledged) == (receipt != nil) else { throw OfflineFailure.storage }
        _ = try receipt?.validated(member: member, command: command)
        return self
    }
}

extension ChoreOfflineStore {
    func readProposalDiscard(lease: OfflineLease) throws -> SavedProposalDiscard? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM proposal_discards WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedProposalDiscard.self, from: data).validated(lease)
    }

    func enqueueProposalDiscard(
        preview: MealProposalEnvelope, operation: UUID, lease: OfflineLease
    ) throws {
        try authorize(lease)
        guard try readProposalDiscard(lease: lease) == nil,
            try readProposalApproval(lease: lease) == nil,
            try readProposalGeneration(lease: lease)?.envelope == preview
        else { throw OfflineFailure.missingSnapshot }
        let command = try DiscardMealProposal(proposal: preview.proposal, operation: operation)
        let saved = try SavedProposalDiscard(preview: preview, command: command, state: .pending).validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO proposal_discards(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func acknowledgeProposalDiscard(_ receipt: MealProposalDiscardReceipt, lease: OfflineLease) throws {
        guard var saved = try readProposalDiscard(lease: lease), saved.state == .pending else {
            throw OfflineFailure.invalidOperation
        }
        saved.state = .acknowledged
        saved.receipt = receipt
        try writeProposalDiscard(saved, lease: lease)
    }

    func conflictProposalDiscard(operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readProposalDiscard(lease: lease), saved.state == .pending,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        saved.state = .conflict
        try writeProposalDiscard(saved, lease: lease)
    }

    func discardConflictedProposalDiscard(lease: OfflineLease) throws {
        guard try readProposalDiscard(lease: lease)?.state == .conflict else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM proposal_discards WHERE actor=? AND household=?", lease.scope)
    }

    func clearConfirmedProposalDiscard(lease: OfflineLease) throws {
        guard let saved = try readProposalDiscard(lease: lease), let receipt = saved.receipt,
            let current = try readProposalGeneration(lease: lease)?.envelope,
            current.proposal.id == receipt.proposalId, current.proposal.status == .discarded,
            current.proposal.revision == receipt.revision,
            current.proposal.entries == saved.preview.proposal.entries
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM proposal_discards WHERE actor=? AND household=?", lease.scope)
    }

    private func writeProposalDiscard(_ saved: SavedProposalDiscard, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE proposal_discards SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }
}
