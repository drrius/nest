import Foundation

struct AuthenticatedSession: Sendable {
    let userId: UUID
    let accessToken: String
}

protocol NestAuthentication: Sendable {
    func session() async throws -> AuthenticatedSession
    func cachedSession() async -> AuthenticatedSession?
    func signIn(appleIDToken: String, nonce: String) async throws -> AuthenticatedSession
    func signOut() async throws
}
