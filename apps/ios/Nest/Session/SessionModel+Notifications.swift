import Foundation

struct NotificationContext {
    let member: VerifiedMember
    let generation: Int
    let lease: OfflineLease
}

extension SessionModel {
    func notificationContext() throws -> NotificationContext {
        guard case .ready(let member) = status, let lease,
            lease.actor == member.userId, lease.household == member.householdId
        else { throw NestAPIFailure.signedOut }
        return NotificationContext(member: member, generation: generation, lease: lease)
    }

    func requireNotificationAccount(_ context: NotificationContext) throws {
        guard generation == context.generation, status == .ready(context.member) else {
            throw NestAPIFailure.signedOut
        }
    }

    func readNotificationPreferences(_ context: NotificationContext) async throws -> NotificationProfileEnvelope {
        let token = try await notificationToken(context)
        guard let notificationAPI else { throw NestAPIFailure.configuration }
        let result = try await notificationAPI.read(token: token, member: context.member)
        try requireNotificationAccount(context)
        return result
    }

    func savedNotificationRequest(_ context: NotificationContext) async throws -> SavedNotificationPreference? {
        try requireNotificationAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        let result = try await offline.readNotificationRequest(lease: context.lease)
        try requireNotificationAccount(context)
        return result
    }

    func stageNotificationPreferences(
        _ preferences: NotificationPreferences, baseline: NotificationProfileEnvelope,
        context: NotificationContext
    ) async throws {
        _ = try baseline.validated(member: context.member)
        _ = try preferences.validated()
        let current = try await readNotificationPreferences(context)
        guard current.profile == baseline.profile else { throw NestAPIFailure.conflict }
        guard let offline else { throw NestAPIFailure.configuration }
        let command = SaveNotificationPreferences(
            operationId: UUID(), expectedRevision: current.profile?.revision ?? "0", preferences: preferences)
        try await offline.stageNotificationRequest(
            SavedNotificationPreference(baseline: current, command: command, state: .pending, receipt: nil),
            lease: context.lease)
        try requireNotificationAccount(context)
    }

    func retryNotificationPreferences(_ context: NotificationContext) async throws {
        guard let saved = try await savedNotificationRequest(context), saved.state == .pending,
            let notificationAPI, let offline
        else { throw OfflineFailure.invalidOperation }
        let token = try await notificationToken(context)
        do {
            let receipt = try await notificationAPI.save(
                token: token, member: context.member, command: saved.command)
            try requireNotificationAccount(context)
            try await offline.acknowledgeNotificationRequest(receipt, lease: context.lease)
            try requireNotificationAccount(context)
        } catch {
            try requireNotificationAccount(context)
            if let failure = error as? NestAPIFailure, [.invalid, .conflict].contains(failure) {
                try await offline.conflictNotificationRequest(
                    operation: saved.command.operationId, lease: context.lease)
            }
            throw error
        }
    }

    func finishNotificationRequest(_ context: NotificationContext) async throws {
        guard let saved = try await savedNotificationRequest(context), let offline else {
            throw OfflineFailure.invalidOperation
        }
        try await offline.finishNotificationRequest(operation: saved.command.operationId, lease: context.lease)
        try requireNotificationAccount(context)
    }

    func notificationToken(_ context: NotificationContext) async throws -> String {
        try requireNotificationAccount(context)
        guard let auth else { throw NestAPIFailure.configuration }
        let session = try await auth.session()
        try requireNotificationAccount(context)
        guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
        return session.accessToken
    }
}
