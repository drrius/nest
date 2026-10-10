import Foundation

/// Claims supply receipt expectations only. PostgREST verifies the token signature;
/// this decoder never establishes a signed-in identity or household authority.
struct PushTokenIdentity: Equatable, Sendable {
    let actor: UUID
    let session: UUID

    init(token: String, expectedActor: UUID) throws {
        guard token.utf8.count <= 16_384 else { throw NestAPIFailure.contract }
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3, parts.allSatisfy(Self.segment) else { throw NestAPIFailure.contract }
        var encoded = String(parts[1]).replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        guard let data = Data(base64Encoded: encoded), let claims = try? JSONDecoder().decode(Claims.self, from: data),
            claims.sub == expectedActor
        else { throw NestAPIFailure.contract }
        actor = claims.sub
        session = claims.sessionId
    }

    private static func segment(_ value: Substring) -> Bool {
        !value.isEmpty
            && value.utf8.allSatisfy {
                (65...90).contains($0) || (97...122).contains($0) || (48...57).contains($0) || $0 == 45 || $0 == 95
            }
    }

    private struct Claims: Decodable {
        let sub: UUID
        let sessionId: UUID
        enum CodingKeys: String, CodingKey {
            case sub
            case sessionId = "session_id"
        }
    }
}

struct PushSessionRevocation: Codable, Equatable, Sendable {
    let version: Int
    let actorId: UUID
    let sessionId: UUID
    let revoked: Bool

    func validated(actor: UUID, session: UUID) throws -> Self {
        guard version == 1, actorId == actor, sessionId == session, revoked else { throw NestAPIFailure.contract }
        return self
    }
}

struct PushLogoutIntent: Codable, Equatable, Sendable {
    let actorId: UUID
    let sessionId: UUID
    var receipt: PushSessionRevocation?

    func validated() throws -> Self {
        _ = try receipt?.validated(actor: actorId, session: sessionId)
        return self
    }
}
