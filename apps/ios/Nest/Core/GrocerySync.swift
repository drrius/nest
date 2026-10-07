import Foundation

struct GrocerySync: Sendable {
    let api: GroceryAPI
    let store: ChoreOfflineStore

    func replayAndRead(token: String, member: VerifiedMember, lease: OfflineLease) async throws
        -> (GroceryList, Bool)
    {
        let conflicted: Bool
        do {
            conflicted = try await replay(token: token, member: member, lease: lease)
        } catch NestAPIFailure.forbidden {
            let verified = try await api.verify(token: token, expectedActor: member.userId)
            guard verified.userId == member.userId, verified.householdId == member.householdId
            else { throw NestAPIFailure.notMember }
            let snapshot = try await api.list(token: token, member: member)
            if let blocked = try await store.nextGroceryCheck(lease) {
                try await store.conflictGroceryCheck(blocked.operationId, reason: "forbidden", lease: lease)
            }
            return (snapshot, true)
        }
        return (try await read(token: token, member: member), conflicted)
    }

    private func read(token: String, member: VerifiedMember) async throws -> GroceryList {
        do {
            return try await api.list(token: token, member: member)
        } catch NestAPIFailure.forbidden {
            let verified = try await api.verify(token: token, expectedActor: member.userId)
            guard verified.userId == member.userId, verified.householdId == member.householdId
            else { throw NestAPIFailure.notMember }
            throw NestAPIFailure.forbidden
        }
    }

    func replay(token: String, member: VerifiedMember, lease: OfflineLease) async throws -> Bool {
        var conflicted = false
        for _ in 0..<200 {
            guard let command = try await store.nextGroceryCheck(lease) else { return conflicted }
            do {
                let receipt = try await api.check(token: token, member: member, command: command)
                try await store.acknowledgeGroceryCheck(receipt, lease: lease)
            } catch let failure as NestAPIFailure {
                let reason: String
                switch failure {
                case .cutover: reason = "cutover"
                case .conflict, .invalid: reason = "changed"
                case .removed: reason = "removed"
                default: throw failure
                }
                try await store.conflictGroceryCheck(command.operationId, reason: reason, lease: lease)
                conflicted = true
            }
        }
        return conflicted
    }
}
