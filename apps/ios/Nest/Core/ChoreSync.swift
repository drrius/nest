import Foundation

struct ChoreSync: Sendable {
    let api: ChoreAPI
    let store: ChoreOfflineStore

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
