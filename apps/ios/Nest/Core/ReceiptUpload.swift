import Foundation

struct ReceiptUploadInput: Codable, Equatable, Sendable {
    let uploadId: UUID
    let sha256: String
    let bytes: Int
    let contentType: String

    func validated() throws -> Self {
        guard (12...4_194_304).contains(bytes),
            ["image/jpeg", "application/pdf"].contains(contentType),
            sha256.range(of: #"\A[0-9a-f]{64}\z"#, options: .regularExpression) != nil
        else { throw NestAPIFailure.contract }
        return self
    }

    func path(household: UUID) -> String {
        let suffix = contentType == "image/jpeg" ? "jpg" : "pdf"
        return "\(household.uuidString.lowercased())/receipts/\(uploadId.uuidString.lowercased()).\(suffix)"
    }
}

struct ReceiptUploadReservation: Codable, Sendable {
    let version: Int
    let householdId: UUID
    let uploaderId: UUID
    let uploadId: UUID
    let sha256: String
    let bytes: Int
    let contentType: String
    let path: String
    let stored: Bool

    func validated(member: VerifiedMember, input: ReceiptUploadInput, requireStored: Bool) throws -> Self {
        _ = try input.validated()
        guard version == 1, householdId == member.householdId, uploaderId == member.userId,
            uploadId == input.uploadId, sha256 == input.sha256, bytes == input.bytes,
            contentType == input.contentType, path == input.path(household: member.householdId),
            !requireStored || stored
        else { throw NestAPIFailure.contract }
        return self
    }
}
