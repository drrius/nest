import Foundation

struct RenewalCommand: Codable, Equatable, Sendable {
    let operationId: UUID
    let renewalId: UUID
    let expectedRevision: UUID?
    let fields: CalendarRenewal.Fields?
    var removing: Bool { fields == nil }

    enum CodingKeys: String, CodingKey { case operationId, renewalId, expectedRevision, fields }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(operationId, forKey: .operationId)
        try values.encode(renewalId, forKey: .renewalId)
        try values.encode(expectedRevision, forKey: .expectedRevision)
        try values.encodeIfPresent(fields, forKey: .fields)
    }

    func validated() throws -> Self {
        if let fields {
            _ = try fields.validated(edited: true)
        } else if expectedRevision == nil {
            throw NestAPIFailure.invalid
        }
        return self
    }
}

struct RenewalReceipt: Codable, Equatable, Sendable {
    enum Action: String, Codable, Sendable { case saved, removed }
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let command: RenewalCommand
    let action: Action
    let renewal: CalendarRenewal

    func validated(member: VerifiedMember, expected: RenewalCommand) throws -> Self {
        _ = try expected.validated()
        _ = try renewal.validated()
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            command == expected, operationId == expected.operationId, renewal.id == expected.renewalId,
            renewal.revision != expected.expectedRevision,
            action == (expected.removing ? .removed : .saved), renewal.removed == expected.removing,
            expected.removing || renewal.fields == expected.fields
        else { throw NestAPIFailure.contract }
        return self
    }
}

struct RenewalRecovery: Codable, Equatable, Sendable {
    enum Status: String, Codable, Sendable { case unresolved, cancelled, recorded }
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let status: Status
    let receipt: RenewalReceipt?

    func validated(member: VerifiedMember, command: RenewalCommand) throws -> Self {
        _ = try command.validated()
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, (status == .recorded) == (receipt != nil)
        else { throw NestAPIFailure.contract }
        _ = try receipt?.validated(member: member, expected: command)
        return self
    }
}

struct RenewalList: Decodable, Sendable {
    let version: Int
    let householdId: UUID
    let after: UUID?
    let next: UUID?
    let renewals: [CalendarRenewal]

    func validated(member: VerifiedMember, cursor: UUID?) throws -> Self {
        guard version == 1, householdId == member.householdId, after == cursor, renewals.count <= 50 else {
            throw NestAPIFailure.contract
        }
        var previous = cursor?.uuidString.lowercased() ?? ""
        for renewal in renewals {
            _ = try renewal.validated()
            let identity = renewal.id.uuidString.lowercased()
            guard !renewal.removed, identity > previous else { throw NestAPIFailure.contract }
            previous = identity
        }
        guard next == nil || (renewals.count == 50 && next == renewals.last?.id) else {
            throw NestAPIFailure.contract
        }
        return self
    }
}

struct RenewalDetail: Decodable, Sendable {
    let version: Int
    let householdId: UUID
    let renewal: CalendarRenewal

    func validated(member: VerifiedMember, id: UUID) throws -> Self {
        guard version == 1, householdId == member.householdId, renewal.id == id else {
            throw NestAPIFailure.contract
        }
        _ = try renewal.validated()
        return self
    }
}
