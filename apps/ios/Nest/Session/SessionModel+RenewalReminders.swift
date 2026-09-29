import Foundation

extension SessionModel {
    func readRenewalReminder(_ context: RenewalContext, id: UUID) async throws -> RenewalReminderEnvelope {
        let token = try await renewalToken(context)
        guard let notificationAPI else { throw NestAPIFailure.configuration }
        let result = try await notificationAPI.renewalReminder(token: token, member: context.member, id: id)
        try requireRenewalAccount(context)
        return result
    }

    func savedRenewalReminderRequest(_ context: RenewalContext) async throws -> SavedRenewalReminderRequest? {
        try requireRenewalAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        let result = try await offline.readRenewalReminderRequest(lease: context.lease)
        try requireRenewalAccount(context)
        return result
    }

    func stageRenewalReminder(
        _ command: SaveRenewalReminder, renewal: CalendarRenewal,
        baseline: RenewalReminderEnvelope, context: RenewalContext
    ) async throws {
        let roster = try await renewalRoster(context)
        _ = try command.validated(members: roster.members.map(\.actorId))
        let current = try await readRenewal(context, id: command.renewalId)
        guard current == renewal, !current.removed else { throw NestAPIFailure.conflict }
        let preferences = try await readRenewalReminder(context, id: command.renewalId)
        guard preferences == baseline else { throw NestAPIFailure.conflict }
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.stageRenewalReminderRequest(
            .init(
                renewal: renewal, baseline: baseline,
                command: command, result: nil), lease: context.lease)
        try requireRenewalAccount(context)
    }

    func retryRenewalReminder(_ context: RenewalContext) async throws {
        guard let saved = try await savedRenewalReminderRequest(context), let notificationAPI, let offline else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return }
        let token = try await renewalToken(context)
        let result = try await notificationAPI.recoverRenewalReminder(
            token: token, member: context.member,
            command: saved.command, cancel: saved.cancellationRequested)
        try requireRenewalAccount(context)
        try await offline.recordRenewalReminderRecovery(result, lease: context.lease)
        try requireRenewalAccount(context)
        guard result.status == .unresolved else { return }
        guard let current = try await savedRenewalReminderRequest(context) else {
            throw OfflineFailure.invalidOperation
        }
        if current.cancellationRequested {
            let cancelled = try await notificationAPI.recoverRenewalReminder(
                token: token, member: context.member,
                command: current.command, cancel: true)
            try requireRenewalAccount(context)
            try await offline.recordRenewalReminderRecovery(cancelled, lease: context.lease)
        } else {
            let receipt = try await notificationAPI.saveRenewalReminder(
                token: token, member: context.member,
                command: current.command)
            try requireRenewalAccount(context)
            try await offline.recordRenewalReminderRecovery(
                .init(
                    version: 1, actorId: receipt.actorId,
                    householdId: receipt.householdId,
                    operationId: receipt.operationId, status: .recorded,
                    receipt: receipt), lease: context.lease)
        }
        try requireRenewalAccount(context)
    }

    func cancelRenewalReminder(_ context: RenewalContext) async throws {
        try requireRenewalAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestRenewalReminderCancellation(lease: context.lease)
        try requireRenewalAccount(context)
        try await retryRenewalReminder(context)
    }

    func finishRenewalReminder(_ context: RenewalContext) async throws {
        guard let saved = try await savedRenewalReminderRequest(context), let offline else {
            throw OfflineFailure.invalidOperation
        }
        try await offline.finishRenewalReminderRequest(operation: saved.command.operationId, lease: context.lease)
        try requireRenewalAccount(context)
    }
}
