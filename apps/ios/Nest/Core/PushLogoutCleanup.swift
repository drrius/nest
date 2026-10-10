import Foundation

struct PushLogoutCleanup: Sendable {
    let api: PushLogoutAPI
    let store: ChoreOfflineStore

    /// Persist intent before sending. A lost acknowledgement remains pending; a fresh login may
    /// stop an older session for the same actor without authorizing any household mutation.
    func stop(token: String, actor: UUID, session: UUID) async throws -> PushSessionRevocation {
        let identity = try PushTokenIdentity(token: token, expectedActor: actor)
        try await store.stagePushLogout(actor: actor, session: session)
        guard let intent = try await store.pendingPushLogouts(actor: actor).first(where: { $0.sessionId == session })
        else { throw OfflineFailure.storage }
        if let receipt = intent.receipt { return try receipt.validated(actor: actor, session: session) }
        let receipt = try await api.revoke(
            token: token, actor: actor, previousSession: identity.session == session ? nil : session)
        try await store.recordPushLogout(receipt)
        return receipt
    }
}
