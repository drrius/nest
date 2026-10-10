import Foundation

struct SavedPushDeviceRequest: Codable, Equatable, Sendable, CustomStringConvertible, CustomDebugStringConvertible {
    let baseline: PushDeviceState
    let command: PushDeviceCommand
    let sessionId: UUID
    var result: PushDeviceRecovery?
    var cancellationRequested = false

    var description: String { "Saved push device request (redacted)" }
    var debugDescription: String { description }

    func validated(member: VerifiedMember) throws -> Self {
        _ = try command.validated()
        _ = try baseline.validated(member: member, installation: command.installationId)
        guard command.expectedRevision == baseline.revision else { throw OfflineFailure.storage }
        _ = try result?.validated(member: member, command: command)
        return self
    }
}

extension ChoreOfflineStore {
    static func createPushRecoveryTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS push_device_requests (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readPushDeviceRequest(lease: OfflineLease) throws -> SavedPushDeviceRequest? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM push_device_requests WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedPushDeviceRequest.self, from: data).validated(member: pushMember(lease))
    }

    /// Protected local recovery only; enrollment is never added to the automatic offline outbox.
    func stagePushDeviceRequest(_ saved: SavedPushDeviceRequest, lease: OfflineLease) throws {
        _ = try saved.validated(member: pushMember(lease))
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.transaction {
            if saved.command.action == .register, try hasPendingPushCleanup() { throw OfflineFailure.sessionChanged }
            guard try readPushDeviceRequest(lease: lease) == nil, saved.result == nil, !saved.cancellationRequested
            else {
                throw OfflineFailure.alreadyQueued
            }
            try trackPushSession(actor: lease.actor, session: saved.sessionId)
            try db.run("INSERT INTO push_device_requests(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
        }
    }

    func recordPushDeviceRecovery(_ result: PushDeviceRecovery, lease: OfflineLease) throws {
        guard var saved = try readPushDeviceRequest(lease: lease) else { throw OfflineFailure.invalidOperation }
        if let previous = saved.result, previous.status != .unresolved {
            guard previous == result else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        try writePushDeviceRequest(saved, lease: lease)
    }

    func requestPushDeviceCancellation(lease: OfflineLease) throws {
        guard var saved = try readPushDeviceRequest(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        try writePushDeviceRequest(saved, lease: lease)
    }

    func finishPushDeviceRequest(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readPushDeviceRequest(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM push_device_requests WHERE actor=? AND household=?", lease.scope)
    }

    private func writePushDeviceRequest(_ saved: SavedPushDeviceRequest, lease: OfflineLease) throws {
        _ = try saved.validated(member: pushMember(lease))
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE push_device_requests SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func pushMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
