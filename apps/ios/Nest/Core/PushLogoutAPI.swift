import Foundation

/// Direct Auth RPC: membership is deliberately unnecessary when stopping one's own notifications.
struct PushLogoutAPI: Sendable {
    private let origin: URL
    private let publishableKey: String
    private let transport: @Sendable (URLRequest) async throws -> (Data, URLResponse)

    init(origin: URL, publishableKey: String) throws {
        try self.init(origin: origin, publishableKey: publishableKey) { request in
            let configuration = URLSessionConfiguration.ephemeral
            configuration.httpShouldSetCookies = false
            let session = URLSession(configuration: configuration)
            defer { session.finishTasksAndInvalidate() }
            return try await session.data(for: request, delegate: NoRedirects())
        }
    }

    init(
        origin: URL, publishableKey: String,
        transport: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) throws {
        _ = try NestHTTP(baseURL: origin)
        guard publishableKey.hasPrefix("sb_publishable_"), publishableKey.utf8.count <= 4096,
            !publishableKey.contains(where: { $0.isWhitespace })
        else { throw NestAPIFailure.configuration }
        self.origin = origin
        self.publishableKey = publishableKey
        self.transport = transport
    }

    func revoke(token: String, actor: UUID, previousSession: UUID? = nil) async throws -> PushSessionRevocation {
        let identity = try PushTokenIdentity(token: token, expectedActor: actor)
        let expected = previousSession ?? identity.session
        let method = previousSession == nil ? "nest_revoke_push_session" : "nest_revoke_previous_push_session"
        let url = origin.appending(path: "rest/v1/rpc/\(method)")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.httpShouldHandleCookies = false
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONEncoder().encode(
            previousSession.map { ["p_session": $0.uuidString.lowercased()] } ?? [:])
        try Task.checkCancellation()
        let (body, response): (Data, URLResponse)
        do { (body, response) = try await transport(request) } catch { throw NestAPIFailure.unavailable }
        try Task.checkCancellation()
        guard let http = response as? HTTPURLResponse, body.count <= 4096 else { throw NestAPIFailure.unavailable }
        guard http.statusCode == 200 else {
            switch http.statusCode {
            case 401: throw NestAPIFailure.signedOut
            case 403: throw NestAPIFailure.forbidden
            default: throw NestAPIFailure.unavailable
            }
        }
        guard let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
            Set(object.keys) == ["version", "actorId", "sessionId", "revoked"],
            let receipt = try? JSONDecoder().decode(PushSessionRevocation.self, from: body)
        else { throw NestAPIFailure.contract }
        return try receipt.validated(actor: actor, session: expected)
    }
}
