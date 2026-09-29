import Foundation

extension SessionModel {
    func readRecurringReminder(_ context: RenewalContext, id: UUID) async throws -> RecurringReminderContext {
        let token = try await renewalToken(context)
        guard let notificationAPI else { throw NestAPIFailure.configuration }
        let result = try await notificationAPI.recurringReminder(token: token, member: context.member, id: id)
        try requireRenewalAccount(context)
        return result
    }

    func savedRecurringReminderRequest(_ context: RenewalContext) async throws -> SavedRecurringReminderRequest? {
        try requireRenewalAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        let result = try await offline.readRecurringReminderRequest(lease: context.lease)
        try requireRenewalAccount(context)
        return result
    }

    func stageRecurringReminder(
        _ command: SaveRecurringReminder, baseline: RecurringReminderContext, context: RenewalContext
    ) async throws {
        let roster = try await renewalRoster(context)
        _ = try command.validated(members: roster.members.map(\.actorId))
        let current = try await readRecurringReminder(context, id: command.ruleId)
        guard current == baseline, current.rule.status == .active,
            current.rule.nextDueOn == command.expectedDueOn
        else { throw NestAPIFailure.conflict }
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.stageRecurringReminderRequest(
            .init(baseline: baseline, command: command, result: nil), lease: context.lease)
        try requireRenewalAccount(context)
    }

    func retryRecurringReminder(_ context: RenewalContext) async throws {
        guard let saved = try await savedRecurringReminderRequest(context), let notificationAPI, let offline else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return }
        let token = try await renewalToken(context)
        let result = try await notificationAPI.recoverRecurringReminder(
            token: token, member: context.member,
            command: saved.command, cancel: saved.cancellationRequested)
        try requireRenewalAccount(context)
        try await offline.recordRecurringReminderRecovery(result, lease: context.lease)
        try requireRenewalAccount(context)
        guard result.status == .unresolved else { return }
        guard let current = try await savedRecurringReminderRequest(context) else {
            throw OfflineFailure.invalidOperation
        }
        if current.cancellationRequested {
            let cancelled = try await notificationAPI.recoverRecurringReminder(
                token: token, member: context.member,
                command: current.command, cancel: true)
            try requireRenewalAccount(context)
            try await offline.recordRecurringReminderRecovery(cancelled, lease: context.lease)
        } else {
            let receipt = try await notificationAPI.saveRecurringReminder(
                token: token, member: context.member,
                command: current.command)
            try requireRenewalAccount(context)
            try await offline.recordRecurringReminderRecovery(
                .init(
                    version: 1, actorId: receipt.actorId,
                    householdId: receipt.householdId,
                    operationId: receipt.operationId, status: .recorded,
                    receipt: receipt), lease: context.lease)
        }
        try requireRenewalAccount(context)
    }

    func cancelRecurringReminder(_ context: RenewalContext) async throws {
        try requireRenewalAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestRecurringReminderCancellation(lease: context.lease)
        try requireRenewalAccount(context)
        try await retryRecurringReminder(context)
    }

    func finishRecurringReminder(_ context: RenewalContext) async throws {
        guard let saved = try await savedRecurringReminderRequest(context), let offline else {
            throw OfflineFailure.invalidOperation
        }
        try await offline.finishRecurringReminderRequest(operation: saved.command.operationId, lease: context.lease)
        try requireRenewalAccount(context)
    }
}
