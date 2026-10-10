import Foundation

struct BusySnapshot: Codable, Sendable {
    let actorId: UUID
    let schemaVersion: Int
    let consent: String
    let generation: String
    let capturedAt: String
    let expiresAt: String
    let covered: BusyInterval
    let intervals: [BusyInterval]

    func validated() throws -> Self {
        guard schemaVersion == 1, try CalendarConsent.revision(consent) > 0,
            try CalendarConsent.revision(generation) > 0,
            try BusyCapture.timestamp(expiresAt).timeIntervalSince(BusyCapture.timestamp(capturedAt)) == 900
        else { throw CalendarConsentError.invalid }
        _ = try BusyProjection(covered: covered, intervals: intervals).validated()
        return self
    }

    func state(for query: BusyInterval, now: Date) -> BusyState {
        guard (try? validated()) != nil, now.timeIntervalSince1970.isFinite,
            let captured = try? BusyCapture.timestamp(capturedAt),
            let expires = try? BusyCapture.timestamp(expiresAt),
            now >= captured, now < expires, query.valid,
            query.start >= covered.start, query.end <= covered.end
        else { return .unknown }
        return intervals.contains { $0.start < query.end && $0.end > query.start } ? .busy : .free
    }
}

struct BusySnapshotsEnvelope: Codable, Sendable {
    let version: Int
    let householdId: UUID
    let snapshots: [BusySnapshot]

    func validated(household: UUID) throws -> Self {
        guard version == 1, householdId == household, snapshots.count <= 2,
            Set(snapshots.map(\.actorId)).count == snapshots.count
        else { throw CalendarConsentError.invalid }
        for snapshot in snapshots { _ = try snapshot.validated() }
        return self
    }

    func state(for actor: UUID, query: BusyInterval, now: Date) -> BusyState {
        snapshots.first { $0.actorId == actor }?.state(for: query, now: now) ?? .unknown
    }
}

extension CalendarAPI {
    func snapshots(token: String, member: VerifiedMember) async throws -> BusySnapshotsEnvelope {
        let response = try await http.read(
            "v1/calendar/busy", token: token, household: member.householdId, as: BusySnapshotsEnvelope.self)
        return try response.validated(household: member.householdId)
    }
}
