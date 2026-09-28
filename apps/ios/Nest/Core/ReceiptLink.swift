import Foundation

struct ReceiptMetadata: Codable, Sendable {
    struct Target: Codable, Sendable { let eventId: UUID }
    struct Receipt: Codable, Sendable {
        let path: String
        let contentType: String
        let bytes: Centimes?
    }
    let version: Int
    let householdId: UUID
    let target: Target
    let receipt: Receipt?

    func validated(member: VerifiedMember, eventId: UUID) throws -> Self {
        guard version == 1, householdId == member.householdId, target.eventId == eventId else {
            throw NestAPIFailure.contract
        }
        if let receipt {
            guard receipt.path.lowercased().hasPrefix(householdId.uuidString.lowercased() + "/receipts/"),
                receipt.path.range(
                    of:
                        #"\A[0-9a-f-]{36}/receipts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)\z"#,
                    options: [.regularExpression, .caseInsensitive]) != nil,
                ["image/jpeg", "image/png", "image/webp", "application/pdf"].contains(receipt.contentType),
                (receipt.bytes?.value ?? 0) >= 0
            else { throw NestAPIFailure.contract }
        }
        return self
    }
}

struct ReceiptLink: Codable, Sendable {
    let metadata: ReceiptMetadata
    let url: String
    let expiresAt: String

    func validated(member: VerifiedMember, eventId: UUID, origin: URL, now: Date = .now) throws -> URL {
        _ = try metadata.validated(member: member, eventId: eventId)
        guard let receipt = metadata.receipt, let target = URLComponents(string: url),
            let base = URLComponents(url: origin, resolvingAgainstBaseURL: false),
            base.scheme == "https", target.scheme == base.scheme, target.host == base.host, target.port == base.port,
            target.user == nil, target.password == nil, target.fragment == nil,
            target.path == "/storage/v1/object/sign/household-files/\(receipt.path)",
            let queries = target.queryItems, queries.count == 1, queries[0].name == "token",
            let token = queries[0].value, token.range(of: #"\A[A-Za-z0-9_.-]+\z"#, options: .regularExpression) != nil,
            try BusyCapture.timestamp(expiresAt) > now, let result = target.url
        else { throw NestAPIFailure.contract }
        return result
    }
}

extension MoneyAPI {
    func receiptLink(token: String, member: VerifiedMember, eventId: UUID) async throws -> URL {
        guard let storageOrigin else { throw NestAPIFailure.configuration }
        let result = try await http.read(
            "v1/money/receipt/link?eventId=\(eventId.uuidString.lowercased())",
            token: token, household: member.householdId, as: ReceiptLink.self)
        return try result.validated(member: member, eventId: eventId, origin: storageOrigin)
    }
}
