import Foundation

extension SessionModel {
    func readChoreReminder(_ context: RenewalContext, id: UUID) async throws -> ChoreReminderContext {
        let token = try await renewalToken(context)
        guard let notificationAPI else { throw NestAPIFailure.configuration }
        let result = try await notificationAPI.choreReminder(token: token, member: context.member, id: id)
        try requireRenewalAccount(context)
        return result
    }

    func savedChoreReminderRequest(_ context: RenewalContext) async throws -> SavedChoreReminderRequest? {
        try requireRenewalAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        let result = try await offline.readChoreReminderRequest(lease: context.lease)
        try requireRenewalAccount(context)
        return result
    }

    func stageChoreReminder(
        _ command: SaveChoreReminder, baseline: ChoreReminderContext, context: RenewalContext
    ) async throws {
        let roster = try await renewalRoster(context)
        _ = try command.validated(members: roster.members.map(\.actorId))
        let current = try await readChoreReminder(context, id: command.occurrenceId)
        guard current == baseline else { throw NestAPIFailure.conflict }
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.stageChoreReminderRequest(
            .init(baseline: baseline, command: command, result: nil), lease: context.lease)
        try requireRenewalAccount(context)
    }

    func retryChoreReminder(_ context: RenewalContext) async throws {
        guard let saved = try await savedChoreReminderRequest(context), let notificationAPI, let offline else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return }
        let token = try await renewalToken(context)
        let result = try await notificationAPI.recoverChoreReminder(
            token: token, member: context.member,
            command: saved.command, cancel: saved.cancellationRequested)
        try requireRenewalAccount(context)
        try await offline.recordChoreReminderRecovery(result, lease: context.lease)
        try requireRenewalAccount(context)
        guard result.status == .unresolved else { return }
        guard let current = try await savedChoreReminderRequest(context) else {
            throw OfflineFailure.invalidOperation
        }
        if current.cancellationRequested {
            let cancelled = try await notificationAPI.recoverChoreReminder(
                token: token, member: context.member,
                command: current.command, cancel: true)
            try requireRenewalAccount(context)
            try await offline.recordChoreReminderRecovery(cancelled, lease: context.lease)
        } else {
            let receipt = try await notificationAPI.saveChoreReminder(
                token: token, member: context.member,
                command: current.command)
            try requireRenewalAccount(context)
            try await offline.recordChoreReminderRecovery(
                .init(
                    version: 1, actorId: receipt.actorId,
                    householdId: receipt.householdId,
                    operationId: receipt.operationId, status: .recorded,
                    receipt: receipt), lease: context.lease)
        }
        try requireRenewalAccount(context)
    }

    func cancelChoreReminder(_ context: RenewalContext) async throws {
        try requireRenewalAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestChoreReminderCancellation(lease: context.lease)
        try requireRenewalAccount(context)
        try await retryChoreReminder(context)
    }

    func finishChoreReminder(_ context: RenewalContext) async throws {
        guard let saved = try await savedChoreReminderRequest(context), let offline else {
            throw OfflineFailure.invalidOperation
        }
        try await offline.finishChoreReminderRequest(operation: saved.command.operationId, lease: context.lease)
        try requireRenewalAccount(context)
    }
}
