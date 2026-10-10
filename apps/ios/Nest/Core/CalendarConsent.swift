import Foundation

struct CalendarConsent: Codable, Equatable, Sendable {
    let incarnation: UUID
    let version: String
    let enabled: Bool

    func validated() throws -> Self {
        _ = try CalendarConsent.revision(version)
        return self
    }

    static func revision(_ value: String) throws -> Int64 {
        guard let number = Int64(value), number >= 0, String(number) == value else {
            throw CalendarConsentError.invalid
        }
        return number
    }
}

struct SetCalendarConsent: Codable, Equatable, Sendable {
    let incarnation: UUID
    let operationId: UUID
    let expectedRevision: String
    let enabled: Bool

    func validated() throws -> Self {
        guard try CalendarConsent.revision(expectedRevision) < Int64.max else { throw CalendarConsentError.invalid }
        return self
    }
}

struct CalendarConsentEnvelope: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let consent: CalendarConsent

    func validated(member: VerifiedMember) throws -> CalendarConsent {
        guard version == 1, actorId == member.userId, householdId == member.householdId else {
            throw CalendarConsentError.invalid
        }
        return try consent.validated()
    }
}

struct CalendarConsentReceipt: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let consent: CalendarConsent

    func validated(member: VerifiedMember, command: SetCalendarConsent) throws -> CalendarConsent {
        _ = try command.validated()
        _ = try consent.validated()
        let next = try CalendarConsent.revision(command.expectedRevision) + 1
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, consent.incarnation == command.incarnation,
            consent.enabled == command.enabled, consent.version == String(next)
        else { throw CalendarConsentError.invalid }
        return consent
    }
}

enum CalendarConsentError: Error { case invalid }

struct CalendarAPI: Sendable {
    let http: NestHTTP

    func consent(token: String, member: VerifiedMember) async throws -> CalendarConsent {
        let response = try await http.read(
            "v1/calendar/consent", token: token, household: member.householdId, as: CalendarConsentEnvelope.self)
        return try response.validated(member: member)
    }

    func setConsent(token: String, member: VerifiedMember, command: SetCalendarConsent) async throws -> CalendarConsent
    {
        try await setConsentReceipt(token: token, member: member, command: command).consent
    }

    func setConsentReceipt(
        token: String, member: VerifiedMember, command: SetCalendarConsent
    ) async throws -> CalendarConsentReceipt {
        _ = try command.validated()
        let response = try await http.write(
            "v1/calendar/consent/set", token: token, household: member.householdId,
            body: command, as: CalendarConsentReceipt.self)
        _ = try response.validated(member: member, command: command)
        return response
    }
}
