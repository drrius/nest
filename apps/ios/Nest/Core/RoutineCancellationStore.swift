import Foundation

extension ChoreOfflineStore {
    func requestRoutineCancellation(lease: OfflineLease) throws {
        guard var saved = try readRoutineCreation(lease: lease) else { throw OfflineFailure.invalidOperation }
        if saved.receipt != nil || saved.cancellation != nil { return }
        saved.cancellationRequested = true
        try writeRoutineCancellation(saved, lease: lease)
    }

    func reconcileRoutineCancellation(_ result: RoutineCancellation, lease: OfflineLease) throws {
        guard var saved = try readRoutineCreation(lease: lease), saved.cancellationRequested == true else {
            throw OfflineFailure.invalidOperation
        }
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        _ = try result.validated(member: member, command: saved.command)
        if let previous = saved.cancellation {
            guard previous == result else { throw OfflineFailure.invalidOperation }
            return
        }
        if let receipt = saved.receipt {
            guard receipt == result.receipt else { throw OfflineFailure.invalidOperation }
        }
        saved.cancellation = result
        saved.receipt = result.receipt
        try writeRoutineCancellation(saved, lease: lease)
    }

    private func writeRoutineCancellation(_ saved: SavedRoutineCreation, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE routine_creations SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }
}
