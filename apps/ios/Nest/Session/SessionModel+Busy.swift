import Foundation

extension SessionModel {
    func beginCalendarCapture(_ context: CalendarConsentContext, consent: CalendarConsent) async throws -> BusyCapture {
        try requireCalendarContext(context)
        guard consent.enabled, let offline, let lease,
            try await offline.readCalendarConsentChange(lease: lease) == nil
        else { throw OfflineFailure.invalidOperation }
        let fresh = try await readCalendarConsent(context)
        guard fresh == consent else { throw NestAPIFailure.conflict }
        let token = try await busyToken(context)
        guard let calendarAPI else { throw NestAPIFailure.configuration }
        let capture = try await calendarAPI.begin(
            token: token, member: context.member,
            command: .init(incarnation: consent.incarnation, consent: consent.version))
        try requireCalendarContext(context)
        return capture
    }

    func publishCalendarCapture(
        _ context: CalendarConsentContext, capture: BusyCapture, projection: BusyProjection
    ) async throws -> BusyPublishReceipt {
        try requireCalendarContext(context)
        guard let offline, let lease, try await offline.readCalendarConsentChange(lease: lease) == nil else {
            throw OfflineFailure.invalidOperation
        }
        let fresh = try await readCalendarConsent(context)
        guard fresh.enabled, fresh.incarnation == capture.incarnation, fresh.version == capture.consent else {
            throw NestAPIFailure.conflict
        }
        let token = try await busyToken(context)
        guard let calendarAPI else { throw NestAPIFailure.configuration }
        let receipt = try await calendarAPI.publish(
            token: token, member: context.member,
            command: .init(
                incarnation: capture.incarnation, consent: capture.consent, generation: capture.generation,
                covered: projection.covered, intervals: projection.intervals), capture: capture)
        try requireCalendarContext(context)
        return receipt
    }

    func readBusySnapshots(_ context: CalendarConsentContext) async throws -> BusySnapshotsEnvelope {
        let token = try await busyToken(context)
        guard let calendarAPI else { throw NestAPIFailure.configuration }
        let value = try await calendarAPI.snapshots(token: token, member: context.member)
        try requireCalendarContext(context)
        return value
    }

    func readCalendarChores(_ context: CalendarConsentContext, day: CivilDate) async throws -> CalendarChores {
        let token = try await busyToken(context)
        guard let calendarAPI else { throw NestAPIFailure.configuration }
        let result = try await calendarAPI.chores(token: token, member: context.member, day: day)
        try requireCalendarContext(context)
        return result
    }

    private func busyToken(_ context: CalendarConsentContext) async throws -> String {
        try requireCalendarContext(context)
        guard let auth else { throw NestAPIFailure.signedOut }
        let session = try await auth.session()
        try requireCalendarContext(context)
        guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
        return session.accessToken
    }
}
