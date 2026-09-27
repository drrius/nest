import Foundation

struct ChoreSync: Sendable {
    let api: ChoreAPI
    let store: ChoreOfflineStore

    func replayAndRead(token: String, member: VerifiedMember, lease: OfflineLease) async throws
        -> (ChoreSnapshot, Bool)
    {
        let conflicted: Bool
        do {
            conflicted = try await replay(token: token, member: member, lease: lease)
        } catch NestAPIFailure.forbidden {
            let verified = try await api.verify(token: token, expectedActor: member.userId)
            guard verified.userId == member.userId,
                verified.householdId == member.householdId
            else { throw NestAPIFailure.notMember }
            let snapshot = try await api.snapshot(token: token, member: member)
            if let blocked = try await store.next(lease) {
                try await store.conflict(blocked.operationId, reason: "forbidden", lease: lease)
            }
            return (snapshot, true)
        }
        return (try await api.snapshot(token: token, member: member), conflicted)
    }

    func replay(token: String, member: VerifiedMember, lease: OfflineLease) async throws -> Bool {
        var conflicted = false
        for _ in 0..<200 {
            guard let command = try await store.next(lease) else { return conflicted }
            do {
                let receipt = try await api.complete(token: token, member: member, command: command)
                try await store.acknowledge(receipt, lease: lease)
            } catch let failure as NestAPIFailure {
                let reason: String
                switch failure {
                case .cutover: reason = "cutover"
                case .conflict, .invalid: reason = "changed"
                case .removed: reason = "removed"
                default: throw failure
                }
                try await store.conflict(command.operationId, reason: reason, lease: lease)
                conflicted = true
            }
        }
        return conflicted
    }
}
