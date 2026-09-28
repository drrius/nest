import Foundation

extension SessionModel {
    func savedChoreChange(_ context: RoutineCreateContext) async throws -> SavedChoreChange? {
        try requireRoutineAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readChoreChange(lease: context.lease)
        try requireRoutineAccount(context)
        return saved
    }

    func readChangeableChores(_ context: RoutineCreateContext) async throws -> ChoreSnapshot {
        guard let chores else { throw NestAPIFailure.configuration }
        let token = try await routineToken(context)
        let snapshot = try await chores.snapshot(token: token, member: context.member)
        try requireRoutineAccount(context)
        return snapshot
    }

    func stageChoreChange(
        _ chore: NestChore, newDueDate: CivilDate?, context: RoutineCreateContext
    ) async throws {
        let snapshot = try await readChangeableChores(context)
        guard let current = snapshot.chores.first(where: { $0.id == chore.id }), current.dueDate == chore.dueDate,
            current.assigneeId == chore.assigneeId
        else { throw NestAPIFailure.conflict }
        guard let offline else { throw NestAPIFailure.configuration }
        let command = try ChoreChangeCommand(
            operationId: UUID(), occurrenceId: current.id, expectedDueDate: current.dueDate,
            newDueDate: newDueDate
        ).validated()
        try await offline.enqueueChoreChange(command, title: current.title, lease: context.lease)
        try requireRoutineAccount(context)
    }

    func retryChoreChange(_ context: RoutineCreateContext) async throws -> SavedChoreChange {
        guard let saved = try await savedChoreChange(context), let chores, let offline else {
            throw OfflineFailure.invalidOperation
        }
        if saved.receipt != nil || saved.conflicted { return saved }
        let token = try await routineToken(context)
        do {
            let receipt = try await chores.changeOccurrence(
                token: token, member: context.member, command: saved.command)
            try requireRoutineAccount(context)
            try await offline.acknowledgeChoreChange(receipt, lease: context.lease)
        } catch {
            try requireRoutineAccount(context)
            guard error as? NestAPIFailure == .conflict else { throw error }
            try await offline.conflictChoreChange(operation: saved.command.operationId, lease: context.lease)
        }
        guard let result = try await savedChoreChange(context) else { throw OfflineFailure.invalidOperation }
        return result
    }

    func finishChoreChange(_ context: RoutineCreateContext, operation: UUID) async throws {
        try requireRoutineAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishChoreChange(operation: operation, lease: context.lease)
        try requireRoutineAccount(context)
        await refreshToday()
    }
}
