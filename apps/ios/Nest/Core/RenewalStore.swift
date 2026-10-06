import Foundation

struct SavedRenewalCommand: Codable, Equatable, Sendable {
    let baseline: CalendarRenewal?
    let command: RenewalCommand
    var result: RenewalRecovery?
    var cancellationRequested = false

    func validated(member: VerifiedMember) throws -> Self {
        _ = try command.validated()
        if let revision = command.expectedRevision {
            guard let baseline, baseline.id == command.renewalId, baseline.revision == revision, !baseline.removed
            else { throw OfflineFailure.storage }
            _ = try baseline.validated()
        } else if baseline != nil {
            throw OfflineFailure.storage
        }
        if let result {
            _ = try result.validated(member: member, command: command)
            if command.removing, let receipt = result.receipt {
                guard receipt.renewal.fields == baseline?.fields else { throw OfflineFailure.storage }
            }
        }
        return self
    }
}

extension ChoreOfflineStore {
    static func createRenewalRecoveryTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS renewal_requests (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readRenewalRequest(lease: OfflineLease) throws -> SavedRenewalCommand? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM renewal_requests WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedRenewalCommand.self, from: data).validated(member: renewalMember(lease))
    }

    /// Exact recovery only; renewals are not dispatched by the automatic offline outbox.
    func stageRenewalRequest(_ saved: SavedRenewalCommand, lease: OfflineLease) throws {
        guard try readRenewalRequest(lease: lease) == nil, saved.result == nil, !saved.cancellationRequested else {
            throw OfflineFailure.alreadyQueued
        }
        _ = try saved.validated(member: renewalMember(lease))
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO renewal_requests(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func recordRenewalRecovery(_ result: RenewalRecovery, lease: OfflineLease) throws {
        guard var saved = try readRenewalRequest(lease: lease) else { throw OfflineFailure.invalidOperation }
        if let previous = saved.result, previous.status != .unresolved {
            guard previous == result else { throw OfflineFailure.invalidOperation }
            return
        }
        saved.result = result
        try db.transaction {
            try writeRenewalRequest(saved, lease: lease)
            if let receipt = result.receipt { try applyConfirmedRenewalRead(receipt, lease: lease) }
        }
    }

    func requestRenewalCancellation(lease: OfflineLease) throws {
        guard var saved = try readRenewalRequest(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        try writeRenewalRequest(saved, lease: lease)
    }

    func finishRenewalRequest(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readRenewalRequest(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM renewal_requests WHERE actor=? AND household=?", lease.scope)
    }

    private func writeRenewalRequest(_ saved: SavedRenewalCommand, lease: OfflineLease) throws {
        _ = try saved.validated(member: renewalMember(lease))
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE renewal_requests SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func renewalMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
