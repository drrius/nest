import Foundation

struct RoutineCreateContext {
    let member: VerifiedMember
    let generation: Int
    let lease: OfflineLease
}

extension SessionModel {
    func routineCreateContext() throws -> RoutineCreateContext {
        guard case .ready(let member) = status, let lease else { throw NestAPIFailure.signedOut }
        return .init(member: member, generation: generation, lease: lease)
    }

    func readRoutines(_ context: RoutineCreateContext) async throws -> RoutineList {
        let token = try await routineToken(context)
        guard let chores else { throw NestAPIFailure.configuration }
        let list = try await chores.routines(token: token, member: context.member)
        try requireRoutineAccount(context)
        return list
    }

    func readRoutineRoster(_ context: RoutineCreateContext) async throws -> RoutineRoster {
        let token = try await routineToken(context)
        guard let chores else { throw NestAPIFailure.configuration }
        let roster = try await chores.routineRoster(token: token, member: context.member)
        try requireRoutineAccount(context)
        return roster
    }

    func savedRoutineCreation(_ context: RoutineCreateContext) async throws -> SavedRoutineCreation? {
        try requireRoutineAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readRoutineCreation(lease: context.lease)
        try requireRoutineAccount(context)
        return saved
    }

    func stageRoutineCreation(_ command: CreateRoutine, context: RoutineCreateContext) async throws {
        // A new creation needs a live roster. This is recovery, not offline creation support.
        let roster = try await readRoutineRoster(context)
        guard roster.members.count == 2, roster.contains(command.definition.assignment), let offline else {
            throw NestAPIFailure.invalid
        }
        try await offline.enqueueRoutineCreation(command, lease: context.lease)
        try requireRoutineAccount(context)
    }

    func retryRoutineCreation(_ context: RoutineCreateContext) async throws -> SavedRoutineCreation {
        guard let saved = try await savedRoutineCreation(context), let offline, let chores else {
            throw OfflineFailure.invalidOperation
        }
        if saved.receipt != nil || saved.cancellation != nil { return saved }
        let token = try await routineToken(context)
        if saved.cancellationRequested == true {
            let result = try await chores.cancelRoutineCreation(
                token: token, member: context.member, command: saved.command)
            try requireRoutineAccount(context)
            try await offline.reconcileRoutineCancellation(result, lease: context.lease)
            guard let resolved = try await savedRoutineCreation(context) else { throw OfflineFailure.invalidOperation }
            return resolved
        }
        let receipt = try await chores.createRoutine(token: token, member: context.member, command: saved.command)
        try requireRoutineAccount(context)
        try await offline.acknowledgeRoutineCreation(receipt, lease: context.lease)
        guard let confirmed = try await savedRoutineCreation(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func cancelRoutineCreation(_ context: RoutineCreateContext) async throws -> SavedRoutineCreation {
        try requireRoutineAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestRoutineCancellation(lease: context.lease)
        try requireRoutineAccount(context)
        return try await retryRoutineCreation(context)
    }

    func finishRoutineCreation(_ context: RoutineCreateContext, operation: UUID) async throws {
        try requireRoutineAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishRoutineCreation(operationId: operation, lease: context.lease)
        try requireRoutineAccount(context)
        await refreshToday()
    }

    func requireRoutineAccount(_ context: RoutineCreateContext) throws {
        guard generation == context.generation, status == .ready(context.member) else { throw NestAPIFailure.signedOut }
    }

    func routineToken(_ context: RoutineCreateContext) async throws -> String {
        try requireRoutineAccount(context)
        guard let auth else { throw NestAPIFailure.signedOut }
        let session = try await auth.session()
        try requireRoutineAccount(context)
        guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
        return session.accessToken
    }
}
