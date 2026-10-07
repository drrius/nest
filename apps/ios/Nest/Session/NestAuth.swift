import Auth
import Foundation

struct NestAuth: NestAuthentication {
    let client: AuthClient
    private let storage: SecureAuthStorage
    private let storageKey: String
    private let pushCleanup: PushLogoutCleanup?
    private let pushEnabled: Bool
    private let operations = AuthOperationQueue()

    init(configuration: NestConfiguration, offline: ChoreOfflineStore) throws {
        let scope = try NestEnvironmentScope(url: configuration.supabaseURL)
        let key = "nest.auth.\(scope.fingerprint)"
        let localStorage = SecureAuthStorage(service: "ch.drrius.nest.auth.\(scope.fingerprint)")
        storageKey = key
        storage = localStorage
        pushEnabled = configuration.pushEnabled
        pushCleanup = PushLogoutCleanup(
            api: try PushLogoutAPI(origin: configuration.supabaseURL, publishableKey: configuration.publishableKey),
            store: offline)
        let transport = NestAuthHTTP()
        client = AuthClient(
            url: configuration.supabaseURL.appending(path: "auth/v1"),
            headers: ["apikey": configuration.publishableKey],
            storageKey: key,
            localStorage: localStorage,
            fetch: { request in try await transport.fetch(request) },
            // Refresh through session() at request time, serialized with credential changes.
            autoRefreshToken: false
        )
    }

    init(
        client: AuthClient, storage: SecureAuthStorage, storageKey: String, pushCleanup: PushLogoutCleanup?,
        pushEnabled: Bool = true
    ) {
        self.client = client
        self.storage = storage
        self.storageKey = storageKey
        self.pushCleanup = pushCleanup
        self.pushEnabled = pushEnabled
    }

    func session() async throws -> AuthenticatedSession {
        try await operations.run { try await readSession() }
    }

    private func readSession() async throws -> AuthenticatedSession {
        let session = try await client.session
        if let pushCleanup, !(try await pushCleanup.store.pendingPushLogouts(actor: session.user.id)).isEmpty {
            try await finishSignOut()
            throw AuthError.sessionMissing
        }
        return AuthenticatedSession(userId: session.user.id, accessToken: session.accessToken)
    }

    func cachedSession() async -> AuthenticatedSession? {
        try? await operations.run { await readCachedSession() }
    }

    private func readCachedSession() async -> AuthenticatedSession? {
        guard let session = client.currentSession else { return nil }
        if let pushCleanup {
            guard let pending = try? await pushCleanup.store.pendingPushLogouts(actor: session.user.id), pending.isEmpty
            else { return nil }
        }
        return AuthenticatedSession(userId: session.user.id, accessToken: session.accessToken)
    }

    func signIn(appleIDToken: String, nonce: String) async throws -> AuthenticatedSession {
        try await operations.run { try await persistSignIn(appleIDToken: appleIDToken, nonce: nonce) }
    }

    private func persistSignIn(appleIDToken: String, nonce: String) async throws -> AuthenticatedSession {
        let session = try await client.signInWithIdToken(
            credentials: OpenIDConnectCredentials(provider: .apple, idToken: appleIDToken, nonce: nonce)
        )
        guard let data = try storage.retrieve(key: storageKey),
            let saved = try? JSONDecoder().decode(Session.self, from: data),
            saved.accessToken == session.accessToken
        else { throw AuthPersistenceFailure.failed }
        try await recoverOldPushLogouts(session)
        return AuthenticatedSession(userId: session.user.id, accessToken: session.accessToken)
    }

    func signOut() async throws {
        try await operations.run { try await finishSignOut() }
    }

    private func finishSignOut() async throws {
        var actor: UUID?
        if let pushCleanup, let cached = client.currentSession {
            let tracked = try await pushCleanup.store.trackedPushSessions(actor: cached.user.id)
            let pending = try await pushCleanup.store.pendingPushLogouts(actor: cached.user.id)
            if !pushEnabled && tracked.isEmpty && pending.isEmpty {
                try await removeLocalCredentials()
                return
            }
            let captured = try PushTokenIdentity(token: cached.accessToken, expectedActor: cached.user.id)
            // Persist before refresh or network cleanup, including an uncertain enrollment.
            try await pushCleanup.store.stagePushLogout(actor: captured.actor, session: captured.session)
            for session in tracked {
                try await pushCleanup.store.stagePushLogout(actor: captured.actor, session: session)
            }
            let current = try await client.session
            guard current.user.id == captured.actor else { throw AuthPersistenceFailure.failed }
            let identity = try PushTokenIdentity(token: current.accessToken, expectedActor: captured.actor)
            try await pushCleanup.store.stagePushLogout(actor: identity.actor, session: identity.session)
            for intent in try await pushCleanup.store.pendingPushLogouts(actor: captured.actor) {
                _ = try await pushCleanup.stop(
                    token: current.accessToken, actor: captured.actor, session: intent.sessionId)
            }
            actor = captured.actor
        }
        try await removeLocalCredentials()
        if let actor, let pushCleanup {
            for intent in try await pushCleanup.store.pendingPushLogouts(actor: actor) {
                try await pushCleanup.store.finishPushLogout(actor: actor, session: intent.sessionId)
            }
        }
    }

    private func removeLocalCredentials() async throws {
        do { try await client.signOut(scope: .local) } catch {
            // The pinned SDK removes local credentials before its remote logout request.
            guard try storage.retrieve(key: storageKey) == nil else { throw error }
        }
        guard try storage.retrieve(key: storageKey) == nil else { throw AuthPersistenceFailure.failed }
    }

    private func recoverOldPushLogouts(_ session: Session) async throws {
        guard let pushCleanup else { return }
        let pending = try await pushCleanup.store.pendingPushLogouts(actor: session.user.id)
        guard !pending.isEmpty else { return }
        let identity = try PushTokenIdentity(token: session.accessToken, expectedActor: session.user.id)
        for intent in pending {
            if intent.sessionId == identity.session {
                try await finishSignOut()
                throw AuthError.sessionMissing
            }
            _ = try await pushCleanup.stop(
                token: session.accessToken, actor: session.user.id, session: intent.sessionId)
            // The fresh, persisted sign-in has replaced the captured old credentials.
            guard let data = try storage.retrieve(key: storageKey),
                let saved = try? JSONDecoder().decode(Session.self, from: data),
                saved.accessToken == session.accessToken
            else { throw AuthPersistenceFailure.failed }
            try await pushCleanup.store.finishPushLogout(actor: session.user.id, session: intent.sessionId)
        }
    }
}

private enum AuthPersistenceFailure: Error { case failed }
