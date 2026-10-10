import Foundation

extension SessionModel {
    func savedRoutineEdit(_ context: RoutineCreateContext) async throws -> SavedRoutineEdit? {
        try requireRoutineAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readRoutineEdit(lease: context.lease)
        try requireRoutineAccount(context)
        return saved
    }

    func stageRoutineEdit(
        _ patch: RoutinePatch, routine: HouseholdRoutine, context: RoutineCreateContext
    ) async throws {
        _ = try patch.validated()
        let page = try await readRoutines(context)
        guard let current = page.routines.first(where: { $0.id == routine.id }), current.version == routine.version,
            current.state != .archived
        else { throw NestAPIFailure.conflict }
        let roster = RoutineRoster(version: page.version, householdId: page.householdId, members: page.members)
        if let assignment = patch.assignment, !roster.contains(assignment) { throw NestAPIFailure.invalid }
        guard let offline else { throw NestAPIFailure.configuration }
        let command = EditRoutine(
            operationId: UUID(), routineId: current.id, expectedVersion: current.version, patch: patch)
        try await offline.enqueueRoutineEdit(command, title: current.definition.title, lease: context.lease)
        try requireRoutineAccount(context)
    }

    func retryRoutineEdit(_ context: RoutineCreateContext) async throws -> SavedRoutineEdit {
        guard let saved = try await savedRoutineEdit(context), let chores, let offline else {
            throw OfflineFailure.invalidOperation
        }
        if saved.receipt != nil || saved.conflicted { return saved }
        let token = try await routineToken(context)
        do {
            let receipt = try await chores.editRoutine(token: token, member: context.member, command: saved.command)
            try requireRoutineAccount(context)
            try await offline.acknowledgeRoutineEdit(receipt, lease: context.lease)
        } catch {
            try requireRoutineAccount(context)
            guard error as? NestAPIFailure == .conflict else { throw error }
            try await offline.conflictRoutineEdit(operation: saved.command.operationId, lease: context.lease)
        }
        guard let result = try await savedRoutineEdit(context) else { throw OfflineFailure.invalidOperation }
        return result
    }

    func finishRoutineEdit(_ context: RoutineCreateContext, operation: UUID) async throws {
        try requireRoutineAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishRoutineEdit(operation: operation, lease: context.lease)
        try requireRoutineAccount(context)
        await refreshToday()
    }
}
