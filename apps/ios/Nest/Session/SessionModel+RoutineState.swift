import Foundation

extension SessionModel {
    func savedRoutineState(_ context: RoutineCreateContext) async throws -> SavedRoutineState? {
        try requireRoutineAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readRoutineState(lease: context.lease)
        try requireRoutineAccount(context)
        return saved
    }

    func stageRoutineState(
        _ action: RoutineStateCommand.Action, routine: HouseholdRoutine, context: RoutineCreateContext
    ) async throws {
        let page = try await readRoutines(context)
        guard let current = page.routines.first(where: { $0.id == routine.id }), current.version == routine.version,
            current.state != .archived
        else { throw NestAPIFailure.conflict }
        guard
            action == .archive || (action == .pause && current.state == .active)
                || (action == .resume && current.state == .paused)
        else { throw NestAPIFailure.conflict }
        guard let offline else { throw NestAPIFailure.configuration }
        let command = RoutineStateCommand(
            operationId: UUID(), routineId: current.id, expectedVersion: current.version, action: action)
        try await offline.enqueueRoutineState(command, title: current.definition.title, lease: context.lease)
        try requireRoutineAccount(context)
    }

    func retryRoutineState(_ context: RoutineCreateContext) async throws -> SavedRoutineState {
        guard let saved = try await savedRoutineState(context), let chores, let offline else {
            throw OfflineFailure.invalidOperation
        }
        if saved.receipt != nil || saved.conflicted { return saved }
        let token = try await routineToken(context)
        do {
            let receipt = try await chores.setRoutineState(token: token, member: context.member, command: saved.command)
            try requireRoutineAccount(context)
            try await offline.acknowledgeRoutineState(receipt, lease: context.lease)
        } catch {
            try requireRoutineAccount(context)
            guard error as? NestAPIFailure == .conflict else { throw error }
            try await offline.conflictRoutineState(operation: saved.command.operationId, lease: context.lease)
        }
        guard let result = try await savedRoutineState(context) else { throw OfflineFailure.invalidOperation }
        return result
    }

    func finishRoutineState(_ context: RoutineCreateContext, operation: UUID) async throws {
        try requireRoutineAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishRoutineState(operation: operation, lease: context.lease)
        try requireRoutineAccount(context)
        await refreshToday()
    }
}
