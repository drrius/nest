import Foundation

struct CalendarConsentContext {
    let member: VerifiedMember
    let generation: Int
    let pending: SavedCalendarConsent?
}

extension SessionModel {
    func calendarConsentContext() async throws -> CalendarConsentContext {
        guard case .ready(let member) = status, let offline, let lease else { throw NestAPIFailure.signedOut }
        let attempt = generation
        let pending = try await offline.readCalendarConsentChange(lease: lease)
        let context = CalendarConsentContext(member: member, generation: attempt, pending: pending)
        try requireCalendarContext(context)
        return context
    }

    func readCalendarConsent(_ context: CalendarConsentContext) async throws -> CalendarConsent {
        let token = try await calendarToken(context)
        guard let calendarAPI else { throw NestAPIFailure.configuration }
        let value = try await calendarAPI.consent(token: token, member: context.member)
        try requireCalendarContext(context)
        return value
    }

    func stageCalendarConsent(
        _ current: CalendarConsent, enabled: Bool, context: CalendarConsentContext
    ) async throws {
        try requireCalendarContext(context)
        guard let offline, let lease else { throw NestAPIFailure.signedOut }
        try await offline.enqueueCalendarConsentChange(
            current: current, enabled: enabled, operation: UUID(), lease: lease)
        try requireCalendarContext(context)
    }

    func retryCalendarConsent(_ context: CalendarConsentContext) async throws -> CalendarConsent {
        try requireCalendarContext(context)
        guard let offline, let lease, let calendarAPI,
            let pending = try await offline.readCalendarConsentChange(lease: lease), !pending.conflict
        else { throw OfflineFailure.invalidOperation }
        do {
            let token = try await calendarToken(context)
            let receipt = try await calendarAPI.setConsentReceipt(
                token: token, member: context.member, command: pending.command)
            try requireCalendarContext(context)
            try await offline.confirmCalendarConsentChange(receipt, lease: lease)
            try requireCalendarContext(context)
            return receipt.consent
        } catch {
            try requireCalendarContext(context)
            switch error as? NestAPIFailure {
            case .conflict, .invalid, .removed, .cutover:
                try await offline.conflictCalendarConsentChange(operation: pending.command.operationId, lease: lease)
            case .signedOut, .notMember:
                await leaveMealAccount(state(for: error))
            default: break
            }
            throw error
        }
    }

    func discardRejectedCalendarConsent(_ context: CalendarConsentContext) async throws {
        try requireCalendarContext(context)
        guard let offline, let lease else { throw NestAPIFailure.signedOut }
        try await offline.discardRejectedCalendarConsentChange(lease: lease)
        try requireCalendarContext(context)
    }

    func requireCalendarContext(_ context: CalendarConsentContext) throws {
        guard generation == context.generation, status == .ready(context.member) else {
            throw OfflineFailure.sessionChanged
        }
    }

    private func calendarToken(_ context: CalendarConsentContext) async throws -> String {
        try requireCalendarContext(context)
        guard let auth else { throw NestAPIFailure.signedOut }
        let session = try await auth.session()
        try requireCalendarContext(context)
        guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
        return session.accessToken
    }
}

extension SessionModel {
    func revokeCalendarConsentAfterPermissionLoss(
        access: CalendarAccess, context: CalendarConsentContext
    ) async throws -> CalendarConsent? {
        try requireCalendarContext(context)
        guard access == .denied || access == .restricted else { return nil }
        let currentContext = try await calendarConsentContext()
        guard currentContext.pending == nil else { throw OfflineFailure.invalidOperation }
        let current = try await readCalendarConsent(context)
        guard current.enabled else { return current }
        try await stageCalendarConsent(current, enabled: false, context: context)
        return try await retryCalendarConsent(context)
    }
}
