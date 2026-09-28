import Foundation

struct SavedProposalGeneration: Codable, Equatable, Sendable {
    let command: GenerateMealProposal
    var receipt: MealProposalGenerationReceipt?
    var envelope: MealProposalEnvelope?

    func validated(_ lease: OfflineLease) throws -> Self {
        _ = try command.validated()
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        if let receipt {
            _ = try receipt.validated(member: member, command: command)
            if let envelope {
                _ = try MealProposalGenerationResult(version: 1, receipt: receipt, envelope: envelope)
                    .validated(member: member, command: command)
            }
        } else if envelope != nil {
            throw OfflineFailure.storage
        }
        return self
    }
}

extension ChoreOfflineStore {
    func readProposalGeneration(lease: OfflineLease) throws -> SavedProposalGeneration? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM proposal_generations WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedProposalGeneration.self, from: data).validated(lease)
    }

    func enqueueProposalGeneration(_ command: GenerateMealProposal, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readProposalGeneration(lease: lease) == nil else { throw OfflineFailure.invalidOperation }
        let saved = try SavedProposalGeneration(command: command).validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO proposal_generations(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reserveProposalGeneration(_ receipt: MealProposalGenerationReceipt, lease: OfflineLease) throws {
        guard var saved = try readProposalGeneration(lease: lease), saved.receipt == nil || saved.receipt == receipt
        else { throw OfflineFailure.invalidOperation }
        saved.receipt = receipt
        try writeProposalGeneration(saved, lease: lease)
    }

    func saveGeneratedProposal(_ envelope: MealProposalEnvelope, lease: OfflineLease) throws {
        guard var saved = try readProposalGeneration(lease: lease), saved.receipt != nil else {
            throw OfflineFailure.invalidOperation
        }
        let candidate = try SavedProposalGeneration(command: saved.command, receipt: saved.receipt, envelope: envelope)
            .validated(lease)
        if let previous = saved.envelope {
            guard let old = Int64(previous.proposal.revision), let new = Int64(envelope.proposal.revision) else {
                throw OfflineFailure.storage
            }
            guard new >= old else { return }
            guard new != old || previous == envelope else { throw OfflineFailure.storage }
        }
        saved = candidate
        try writeProposalGeneration(saved, lease: lease)
    }

    func clearTerminalProposalGeneration(operation: UUID, lease: OfflineLease) throws {
        guard try readProposalApproval(lease: lease) == nil,
            try readProposalDiscard(lease: lease) == nil,
            try readProposalEdit(lease: lease) == nil,
            let saved = try readProposalGeneration(lease: lease), saved.command.operationId == operation,
            let status = saved.envelope?.proposal.status, status == .approved || status == .discarded
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM proposal_generations WHERE actor=? AND household=?", lease.scope)
    }

    private func writeProposalGeneration(_ saved: SavedProposalGeneration, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE proposal_generations SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }
}
