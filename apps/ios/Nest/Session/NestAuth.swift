import Auth
import Foundation

struct NestAuth: NestAuthentication {
    let client: AuthClient
    private let storage: SecureAuthStorage
    private let storageKey: String

    init(configuration: NestConfiguration) throws {
        let scope = try NestEnvironmentScope(url: configuration.supabaseURL)
        let key = "nest.auth.\(scope.fingerprint)"
        let localStorage = SecureAuthStorage(service: "ch.drrius.nest.auth.\(scope.fingerprint)")
        storageKey = key
        storage = localStorage
        client = AuthClient(
            url: configuration.supabaseURL.appending(path: "auth/v1"),
            headers: ["apikey": configuration.publishableKey],
            storageKey: key,
            localStorage: localStorage,
            autoRefreshToken: true
        )
    }

    func session() async throws -> AuthenticatedSession {
        let session = try await client.session
        return AuthenticatedSession(userId: session.user.id, accessToken: session.accessToken)
    }

    func cachedSession() async -> AuthenticatedSession? {
        guard let session = client.currentSession else { return nil }
        return AuthenticatedSession(userId: session.user.id, accessToken: session.accessToken)
    }

    func signIn(appleIDToken: String, nonce: String) async throws -> AuthenticatedSession {
        let session = try await client.signInWithIdToken(
            credentials: OpenIDConnectCredentials(provider: .apple, idToken: appleIDToken, nonce: nonce)
        )
        guard let data = try storage.retrieve(key: storageKey),
            let saved = try? JSONDecoder().decode(Session.self, from: data),
            saved.accessToken == session.accessToken
        else { throw AuthPersistenceFailure.failed }
        return AuthenticatedSession(userId: session.user.id, accessToken: session.accessToken)
    }

    func signOut() async throws {
        try await client.signOut(scope: .local)
        guard try storage.retrieve(key: storageKey) == nil else { throw AuthPersistenceFailure.failed }
    }
}

private enum AuthPersistenceFailure: Error { case failed }
