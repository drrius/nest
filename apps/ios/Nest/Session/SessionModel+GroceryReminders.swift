import Foundation

extension SessionModel {
    func readGroceryReminder(_ context: RenewalContext, id: UUID) async throws -> GroceryReminderContext {
        let token = try await renewalToken(context)
        guard let notificationAPI else { throw NestAPIFailure.configuration }
        let result = try await notificationAPI.groceryReminder(token: token, member: context.member, id: id)
        try requireRenewalAccount(context)
        return result
    }

    func savedGroceryReminderRequest(_ context: RenewalContext) async throws -> SavedGroceryReminderRequest? {
        try requireRenewalAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        let result = try await offline.readGroceryReminderRequest(lease: context.lease)
        try requireRenewalAccount(context)
        return result
    }

    func stageGroceryReminder(
        _ command: SaveGroceryReminder, baseline: GroceryReminderContext, context: RenewalContext
    ) async throws {
        let roster = try await renewalRoster(context)
        _ = try command.validated(members: roster.members.map(\.actorId))
        let current = try await readGroceryReminder(context, id: command.itemId)
        guard current == baseline, !current.grocery.checked else { throw NestAPIFailure.conflict }
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.stageGroceryReminderRequest(
            .init(baseline: baseline, command: command, result: nil), lease: context.lease)
        try requireRenewalAccount(context)
    }

    func retryGroceryReminder(_ context: RenewalContext) async throws {
        guard let saved = try await savedGroceryReminderRequest(context), let notificationAPI, let offline else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return }
        let token = try await renewalToken(context)
        let result = try await notificationAPI.recoverGroceryReminder(
            token: token, member: context.member,
            command: saved.command, cancel: saved.cancellationRequested)
        try requireRenewalAccount(context)
        try await offline.recordGroceryReminderRecovery(result, lease: context.lease)
        try requireRenewalAccount(context)
        guard result.status == .unresolved else { return }
        guard let current = try await savedGroceryReminderRequest(context) else {
            throw OfflineFailure.invalidOperation
        }
        if current.cancellationRequested {
            let cancelled = try await notificationAPI.recoverGroceryReminder(
                token: token, member: context.member,
                command: current.command, cancel: true)
            try requireRenewalAccount(context)
            try await offline.recordGroceryReminderRecovery(cancelled, lease: context.lease)
        } else {
            let receipt = try await notificationAPI.saveGroceryReminder(
                token: token, member: context.member,
                command: current.command)
            try requireRenewalAccount(context)
            try await offline.recordGroceryReminderRecovery(
                .init(
                    version: 1, actorId: receipt.actorId,
                    householdId: receipt.householdId,
                    operationId: receipt.operationId, status: .recorded,
                    receipt: receipt), lease: context.lease)
        }
        try requireRenewalAccount(context)
    }

    func cancelGroceryReminder(_ context: RenewalContext) async throws {
        try requireRenewalAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestGroceryReminderCancellation(lease: context.lease)
        try requireRenewalAccount(context)
        try await retryGroceryReminder(context)
    }

    func finishGroceryReminder(_ context: RenewalContext) async throws {
        guard let saved = try await savedGroceryReminderRequest(context), let offline else {
            throw OfflineFailure.invalidOperation
        }
        try await offline.finishGroceryReminderRequest(operation: saved.command.operationId, lease: context.lease)
        try requireRenewalAccount(context)
    }
}
