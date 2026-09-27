import Auth
import Foundation

struct NestAuth: Sendable {
    let client: AuthClient
    private let storage: SecureAuthStorage
    private let storageKey: String

    init(configuration: NestConfiguration) {
        let host = configuration.supabaseURL.host ?? "invalid"
        let key = "nest.auth.\(host)"
        let localStorage = SecureAuthStorage(service: "ch.drrius.nest.auth.\(host)")
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

    func session() async throws -> Session { try await client.session }

    func signIn(appleIDToken: String, nonce: String) async throws -> Session {
        let session = try await client.signInWithIdToken(
            credentials: OpenIDConnectCredentials(provider: .apple, idToken: appleIDToken, nonce: nonce)
        )
        guard let data = try storage.retrieve(key: storageKey),
            let saved = try? JSONDecoder().decode(Session.self, from: data),
            saved.accessToken == session.accessToken
        else { throw AuthPersistenceFailure.failed }
        return session
    }

    func signOut() async throws {
        try await client.signOut(scope: .local)
        guard try storage.retrieve(key: storageKey) == nil else { throw AuthPersistenceFailure.failed }
    }
}

private enum AuthPersistenceFailure: Error { case failed }
