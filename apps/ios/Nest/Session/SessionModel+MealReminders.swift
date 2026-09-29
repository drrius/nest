import Foundation

extension SessionModel {
    func readMealReminder(_ context: RenewalContext, id: UUID) async throws -> MealReminderContext {
        let token = try await renewalToken(context)
        guard let notificationAPI else { throw NestAPIFailure.configuration }
        let result = try await notificationAPI.mealReminder(token: token, member: context.member, id: id)
        try requireRenewalAccount(context)
        return result
    }

    func savedMealReminderRequest(_ context: RenewalContext) async throws -> SavedMealReminderRequest? {
        try requireRenewalAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        let result = try await offline.readMealReminderRequest(lease: context.lease)
        try requireRenewalAccount(context)
        return result
    }

    func stageMealReminder(
        _ command: SaveMealReminder, baseline: MealReminderContext, context: RenewalContext
    ) async throws {
        let roster = try await renewalRoster(context)
        _ = try command.validated(members: roster.members.map(\.actorId))
        let current = try await readMealReminder(context, id: command.entryId)
        guard current == baseline else { throw NestAPIFailure.conflict }
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.stageMealReminderRequest(
            .init(baseline: baseline, command: command, result: nil), lease: context.lease)
        try requireRenewalAccount(context)
    }

    func retryMealReminder(_ context: RenewalContext) async throws {
        guard let saved = try await savedMealReminderRequest(context), let notificationAPI, let offline else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return }
        let token = try await renewalToken(context)
        let result = try await notificationAPI.recoverMealReminder(
            token: token, member: context.member,
            command: saved.command, cancel: saved.cancellationRequested)
        try requireRenewalAccount(context)
        try await offline.recordMealReminderRecovery(result, lease: context.lease)
        try requireRenewalAccount(context)
        guard result.status == .unresolved else { return }
        guard let current = try await savedMealReminderRequest(context) else {
            throw OfflineFailure.invalidOperation
        }
        if current.cancellationRequested {
            let cancelled = try await notificationAPI.recoverMealReminder(
                token: token, member: context.member,
                command: current.command, cancel: true)
            try requireRenewalAccount(context)
            try await offline.recordMealReminderRecovery(cancelled, lease: context.lease)
        } else {
            let receipt = try await notificationAPI.saveMealReminder(
                token: token, member: context.member,
                command: current.command)
            try requireRenewalAccount(context)
            try await offline.recordMealReminderRecovery(
                .init(
                    version: 1, actorId: receipt.actorId,
                    householdId: receipt.householdId,
                    operationId: receipt.operationId, status: .recorded,
                    receipt: receipt), lease: context.lease)
        }
        try requireRenewalAccount(context)
    }

    func cancelMealReminder(_ context: RenewalContext) async throws {
        try requireRenewalAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestMealReminderCancellation(lease: context.lease)
        try requireRenewalAccount(context)
        try await retryMealReminder(context)
    }

    func finishMealReminder(_ context: RenewalContext) async throws {
        guard let saved = try await savedMealReminderRequest(context), let offline else {
            throw OfflineFailure.invalidOperation
        }
        try await offline.finishMealReminderRequest(operation: saved.command.operationId, lease: context.lease)
        try requireRenewalAccount(context)
    }
}
