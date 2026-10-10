import Foundation

struct BeginBusyCapture: Codable, Equatable, Sendable {
    let incarnation: UUID
    let consent: String

    func validated() throws -> Self {
        guard try CalendarConsent.revision(consent) > 0 else { throw CalendarConsentError.invalid }
        return self
    }
}

struct BusyCapture: Codable, Sendable {
    let incarnation: UUID
    let consent: String
    let generation: String
    let capturedAt: String
    let expiresAt: String

    func validated(command: BeginBusyCapture) throws -> Self {
        _ = try command.validated()
        guard incarnation == command.incarnation, consent == command.consent,
            try CalendarConsent.revision(generation) > 0,
            try Self.timestamp(expiresAt).timeIntervalSince(Self.timestamp(capturedAt)) == 900
        else { throw CalendarConsentError.invalid }
        return self
    }

    static func timestamp(_ value: String) throws -> Date {
        let pattern = #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$"#
        guard value.range(of: pattern, options: .regularExpression) != nil else { throw CalendarConsentError.invalid }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        guard let date = formatter.date(from: value) else { throw CalendarConsentError.invalid }
        return date
    }
}

struct BusyCaptureEnvelope: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let capture: BusyCapture

    func validated(member: VerifiedMember, command: BeginBusyCapture) throws -> BusyCapture {
        guard version == 1, actorId == member.userId, householdId == member.householdId else {
            throw CalendarConsentError.invalid
        }
        return try capture.validated(command: command)
    }
}

struct PublishBusy: Codable, Sendable {
    let incarnation: UUID
    let consent: String
    let generation: String
    let covered: BusyInterval
    let intervals: [BusyInterval]

    func validated() throws -> Self {
        guard try CalendarConsent.revision(consent) > 0, try CalendarConsent.revision(generation) > 0 else {
            throw CalendarConsentError.invalid
        }
        _ = try BusyProjection(covered: covered, intervals: intervals).validated()
        return self
    }
}

struct BusyPublishReceipt: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let incarnation: UUID
    let consent: String
    let generation: String
    let expiresAt: String

    func validated(member: VerifiedMember, command: PublishBusy, capture: BusyCapture) throws -> Self {
        _ = try command.validated()
        _ = try capture.validated(command: .init(incarnation: command.incarnation, consent: command.consent))
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            incarnation == command.incarnation, consent == command.consent, generation == command.generation,
            generation == capture.generation,
            try BusyCapture.timestamp(expiresAt) == BusyCapture.timestamp(capture.expiresAt)
        else { throw CalendarConsentError.invalid }
        return self
    }
}

extension CalendarAPI {
    func begin(token: String, member: VerifiedMember, command: BeginBusyCapture) async throws -> BusyCapture {
        _ = try command.validated()
        let response = try await http.write(
            "v1/calendar/capture", token: token, household: member.householdId,
            body: command, as: BusyCaptureEnvelope.self)
        return try response.validated(member: member, command: command)
    }

    func publish(
        token: String, member: VerifiedMember, command: PublishBusy, capture: BusyCapture
    ) async throws -> BusyPublishReceipt {
        _ = try command.validated()
        _ = try capture.validated(command: .init(incarnation: command.incarnation, consent: command.consent))
        guard command.generation == capture.generation else { throw CalendarConsentError.invalid }
        let response = try await http.write(
            "v1/calendar/publish", token: token, household: member.householdId,
            body: command, as: BusyPublishReceipt.self)
        return try response.validated(member: member, command: command, capture: capture)
    }
}
