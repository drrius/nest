import Foundation

struct ReceiptRecovery: Codable, Sendable {
    struct Upload: Codable, Sendable {
        enum Status: String, Codable { case pending, deleting }
        let uploadId: UUID
        let sha256: String
        let bytes: Int
        let contentType: String
        let path: String
        let status: Status
        let stored: Bool
        let createdAt: String

        var input: ReceiptUploadInput {
            .init(uploadId: uploadId, sha256: sha256, bytes: bytes, contentType: contentType)
        }
    }
    let version: Int
    let householdId: UUID
    let uploaderId: UUID
    let after: UUID?
    let next: UUID?
    let uploads: [Upload]

    func validated(member: VerifiedMember, after expected: UUID?) throws -> Self {
        guard version == 1, householdId == member.householdId, uploaderId == member.userId,
            after == expected, uploads.count <= 50,
            next == nil || (uploads.count == 50 && next == uploads.last?.uploadId)
        else { throw NestAPIFailure.contract }
        var previous = after?.uuidString.lowercased() ?? ""
        for row in uploads {
            _ = try row.input.validated()
            let key = row.uploadId.uuidString.lowercased()
            guard key > previous, row.path == row.input.path(household: householdId),
                MoneyTime.timestamp(row.createdAt)
            else { throw NestAPIFailure.contract }
            previous = key
        }
        return self
    }
}

struct ReceiptCleanup: Codable, Sendable {
    enum Status: String, Codable { case claimed, deleting, deleted }
    let version: Int
    let householdId: UUID
    let uploadId: UUID
    let path: String
    let status: Status

    func validated(member: VerifiedMember, input: ReceiptUploadInput) throws -> Self {
        _ = try input.validated()
        guard version == 1, householdId == member.householdId, uploadId == input.uploadId,
            path == input.path(household: member.householdId)
        else { throw NestAPIFailure.contract }
        return self
    }
}

extension MoneyAPI {
    func receiptUploads(token: String, member: VerifiedMember, after: UUID?) async throws -> ReceiptRecovery {
        let query = after.map { "?after=\($0.uuidString.lowercased())" } ?? ""
        let result = try await http.read(
            "v1/money/receipt/uploads" + query, token: token, household: member.householdId, as: ReceiptRecovery.self)
        return try result.validated(member: member, after: after)
    }

    func cleanupReceipt(token: String, member: VerifiedMember, input: ReceiptUploadInput) async throws -> ReceiptCleanup
    {
        let result = try await http.write(
            "v1/money/receipt/cleanup", token: token, household: member.householdId,
            body: try input.validated(), as: ReceiptCleanup.self)
        return try result.validated(member: member, input: input)
    }
}
