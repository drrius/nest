import Foundation

extension SessionModel {
    func revokeCalendarConsentAfterPermissionLoss(
        access: CalendarAccess, context: CalendarConsentContext
    ) async throws -> CalendarConsent? {
        try requireCalendarContext(context)
        guard calendarPrivacyGeneration != context.generation else { throw OfflineFailure.invalidOperation }
        calendarPrivacyGeneration = context.generation
        calendarPrivacyRemoving = true
        defer {
            if calendarPrivacyGeneration == context.generation {
                calendarPrivacyGeneration = nil
                calendarPrivacyRemoving = false
            }
        }
        do {
            return try await removeCalendarSharing(access: access, context: context)
        } catch {
            try requireCalendarContext(context)
            calendarPrivacyPending = true
            switch error as? NestAPIFailure {
            case .signedOut, .notMember:
                await leaveMealAccount(state(for: error))
            default: break
            }
            throw error
        }
    }

    private func removeCalendarSharing(
        access: CalendarAccess, context: CalendarConsentContext
    ) async throws -> CalendarConsent? {
        guard let offline, let lease else { throw NestAPIFailure.signedOut }
        if access == .denied || access == .restricted {
            calendarPrivacyPending = true
            try await offline.rememberCalendarPermissionLoss(lease: lease)
            try requireCalendarContext(context)
        }
        let savedRemoval = try await offline.readCalendarPrivacyRemoval(lease: lease)
        try requireCalendarContext(context)
        guard let removal = savedRemoval else {
            calendarPrivacyPending = false
            return nil
        }
        calendarPrivacyPending = true
        CalendarSelectionStore(member: context.member, purpose: .sharing).save([])
        let command: SetCalendarConsent
        if let saved = removal.command {
            command = saved
        } else {
            let current = try await readCalendarConsent(context)
            let pending = try await offline.readCalendarConsentChange(lease: lease)
            try requireCalendarContext(context)
            if !current.enabled && pending == nil && !removal.requiresFence {
                try await offline.clearUnneededCalendarPrivacyRemoval(current, lease: lease)
                try requireCalendarContext(context)
                calendarPrivacyPending = false
                return current
            }
            command = try await offline.stageCalendarPrivacyRemoval(current: current, lease: lease)
        }
        let receipt = try await sendCalendarPrivacyRemoval(command, context: context, lease: lease)
        try await offline.confirmCalendarPrivacyRemoval(receipt, lease: lease)
        try requireCalendarContext(context)
        calendarPrivacyPending = false
        return receipt.consent
    }

    private func sendCalendarPrivacyRemoval(
        _ command: SetCalendarConsent, context: CalendarConsentContext, lease: OfflineLease
    ) async throws -> CalendarConsentReceipt {
        guard let calendarAPI, let offline else { throw NestAPIFailure.configuration }
        do {
            let token = try await calendarToken(context)
            let receipt = try await calendarAPI.setConsentReceipt(
                token: token, member: context.member, command: command)
            try requireCalendarContext(context)
            return receipt
        } catch {
            try requireCalendarContext(context)
            if error as? NestAPIFailure == .conflict {
                // A definite stale-revision response permits a fresh off request; uncertainty does not.
                try await offline.rejectCalendarPrivacyRemoval(operation: command.operationId, lease: lease)
            }
            throw error
        }
    }

    func refreshCalendarPrivacy(access: CalendarAccess) async {
        guard case .ready = status else { return }
        do {
            let context = try await calendarConsentContext()
            _ = try await revokeCalendarConsentAfterPermissionLoss(access: access, context: context)
        } catch {
            // The account-bound routine retains durable intent and exposes uncertainty.
            // Calendar failure never blocks unrelated household screens.
        }
    }
}
