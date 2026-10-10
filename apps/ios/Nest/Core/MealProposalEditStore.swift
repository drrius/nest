import Foundation

struct SavedProposalEdit: Codable, Equatable, Sendable {
    let preview: MealProposalEnvelope
    let command: MealProposalEditCommand
    var result: MealProposalEdit?
    var conflict: Bool

    func validated(_ lease: OfflineLease) throws -> Self {
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        _ = try preview.validated(member: member, id: command.proposalId)
        _ = try command.validated(against: preview.proposal, now: Date(timeIntervalSince1970: 0))
        _ = try result?.validated(member: member, expected: command)
        guard !conflict || result == nil || result?.status == .pending else { throw OfflineFailure.storage }
        return self
    }
}

extension ChoreOfflineStore {
    func readProposalEdit(lease: OfflineLease) throws -> SavedProposalEdit? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM proposal_edits WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedProposalEdit.self, from: data).validated(lease)
    }

    func enqueueProposalEdit(
        preview: MealProposalEnvelope, command: MealProposalEditCommand,
        lease: OfflineLease, now: Date = .now
    ) throws {
        try authorize(lease)
        guard try readProposalEdit(lease: lease) == nil, try readProposalApproval(lease: lease) == nil,
            try readProposalDiscard(lease: lease) == nil,
            try readProposalGeneration(lease: lease)?.envelope == preview
        else { throw OfflineFailure.missingSnapshot }
        _ = try command.validated(against: preview.proposal, now: now)
        let saved = try SavedProposalEdit(preview: preview, command: command, conflict: false).validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO proposal_edits(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func saveProposalEditResult(_ result: MealProposalEdit, lease: OfflineLease) throws {
        guard var saved = try readProposalEdit(lease: lease), !saved.conflict else {
            throw OfflineFailure.invalidOperation
        }
        if let previous = saved.result, previous.status != .pending {
            guard result == previous else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        try writeProposalEdit(saved, lease: lease)
    }

    func conflictProposalEdit(operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readProposalEdit(lease: lease), saved.command.operationId == operation,
            saved.result == nil || saved.result?.status == .pending
        else { throw OfflineFailure.invalidOperation }
        saved.conflict = true
        try writeProposalEdit(saved, lease: lease)
    }

    func clearRejectedProposalEdit(lease: OfflineLease) throws {
        guard let saved = try readProposalEdit(lease: lease), saved.conflict || saved.result?.status == .failed else {
            throw OfflineFailure.invalidOperation
        }
        try db.run("DELETE FROM proposal_edits WHERE actor=? AND household=?", lease.scope)
    }

    func clearAppliedProposalEdit(lease: OfflineLease) throws {
        guard let saved = try readProposalEdit(lease: lease), let receipt = saved.result?.receipt,
            let fresh = try readProposalGeneration(lease: lease)?.envelope,
            fresh.proposal.id == receipt.proposalId, let revision = Int64(fresh.proposal.revision),
            let applied = Int64(receipt.revision), revision >= applied
        else { throw OfflineFailure.invalidOperation }
        if revision == applied { try validateAppliedEdit(saved, fresh: fresh.proposal) }
        try db.run("DELETE FROM proposal_edits WHERE actor=? AND household=?", lease.scope)
    }

    private func validateAppliedEdit(_ saved: SavedProposalEdit, fresh: MealProposal) throws {
        guard let old = saved.preview.proposal.entries, let entries = fresh.entries,
            old.count == entries.count, fresh.status == .ready
        else { throw OfflineFailure.storage }
        for (before, after) in zip(old, entries) {
            guard before.id == after.id, before.date == after.date, before.slot == after.slot else {
                throw OfflineFailure.storage
            }
            if before.id != saved.command.entryId {
                guard before == after else { throw OfflineFailure.storage }
            } else if saved.command.action == .choose {
                guard case .saved(let revision, let recipe) = after.source,
                    recipe.id == saved.command.definitionId, revision == saved.command.expectedLibraryRevision
                else { throw OfflineFailure.storage }
            }
        }
    }

    private func writeProposalEdit(_ saved: SavedProposalEdit, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE proposal_edits SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }
}
