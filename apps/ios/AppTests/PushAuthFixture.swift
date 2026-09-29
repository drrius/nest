import Auth
import Foundation

@testable import Nest

enum PushAuthFixture {
    static func id(_ n: Int) -> UUID { UUID(uuidString: String(format: "00000000-0000-4000-8000-%012d", n))! }

    static func session(actor: UUID = id(1), session: UUID = id(55), expired: Bool = false) -> Session {
        let claims = "{\"sub\":\"\(actor.uuidString)\",\"session_id\":\"\(session.uuidString)\"}"
        let payload = Data(claims.utf8).base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        return Session(
            accessToken: "e30.\(payload).fictional_signature", tokenType: "bearer",
            expiresIn: 3600, expiresAt: Date().timeIntervalSince1970 + (expired ? -60 : 3600),
            refreshToken: "fictional-refresh",
            user: User(
                id: actor, appMetadata: [:], userMetadata: [:], aud: "authenticated", createdAt: Date(),
                updatedAt: Date()))
    }

    static func auth(
        storage: SecureAuthStorage, server: PushAuthServer, cleanup: PushLogoutCleanup?, pushEnabled: Bool = true
    ) -> NestAuth {
        let client = AuthClient(
            url: URL(string: "https://auth.example.test/auth/v1")!, headers: ["apikey": "sb_publishable_fixture"],
            storageKey: "fixture", localStorage: storage,
            fetch: { request in try await server.auth(request) }, autoRefreshToken: false)
        return NestAuth(
            client: client, storage: storage, storageKey: "fixture", pushCleanup: cleanup, pushEnabled: pushEnabled)
    }

    static func cleanup(store: ChoreOfflineStore, server: PushAuthServer) throws -> PushLogoutCleanup {
        .init(
            api: try PushLogoutAPI(
                origin: URL(string: "https://auth.example.test")!, publishableKey: "sb_publishable_fixture"
            ) { request in
                try await server.push(request)
            }, store: store)
    }
}

actor PushAuthServer {
    private var active = PushAuthFixture.session()
    private var losePush = false
    private var loseLogout = false
    private var loseRefresh = false
    private(set) var calls: [String] = []
    private(set) var revoked: Set<UUID> = []

    func loseNextPushReply() { losePush = true }
    func failRemoteLogout() { loseLogout = true }
    func failRefresh() { loseRefresh = true }
    func next(_ session: Session) { active = session }

    func auth(_ request: URLRequest) throws -> (Data, URLResponse) {
        calls.append(request.url!.lastPathComponent)
        if request.url!.path.hasSuffix("logout") {
            if loseLogout { throw URLError(.networkConnectionLost) }
            return reply(request, body: Data(), status: 204)
        }
        guard request.url!.path.hasSuffix("token") else { throw NestAPIFailure.contract }
        if loseRefresh && (request.url!.query ?? "").contains("grant_type=refresh_token") {
            throw URLError(.notConnectedToInternet)
        }
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .iso8601
        return reply(request, body: try encoder.encode(active), status: 200)
    }

    func push(_ request: URLRequest) throws -> (Data, URLResponse) {
        calls.append(request.url!.lastPathComponent)
        guard let header = request.value(forHTTPHeaderField: "Authorization"), header.hasPrefix("Bearer ") else {
            throw NestAPIFailure.contract
        }
        let identity = try PushTokenIdentity(token: String(header.dropFirst(7)), expectedActor: active.user.id)
        let input = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
        let session = input["p_session"].flatMap(UUID.init(uuidString:)) ?? identity.session
        revoked.insert(session)
        if losePush {
            losePush = false
            throw URLError(.networkConnectionLost)
        }
        let receipt = PushSessionRevocation(version: 1, actorId: identity.actor, sessionId: session, revoked: true)
        return reply(request, body: try JSONEncoder().encode(receipt), status: 200)
    }

    private func reply(_ request: URLRequest, body: Data, status: Int) -> (Data, URLResponse) {
        (
            body,
            HTTPURLResponse(
                url: request.url!, statusCode: status, httpVersion: nil,
                headerFields: ["Content-Type": "application/json"])!
        )
    }
}
