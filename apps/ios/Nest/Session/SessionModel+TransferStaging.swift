import Foundation

extension SessionModel {
    func stageTransferRequest(_ chore: NestChore, recipient: UUID, context: RoutineCreateContext) async throws {
        let snapshot = try await readChangeableChores(context)
        guard let current = snapshot.chores.first(where: { $0.id == chore.id }),
            current.dueDate == chore.dueDate, current.assigneeId == context.member.userId,
            chore.assigneeId == context.member.userId,
            !snapshot.transfers.contains(where: { $0.occurrenceId == chore.id })
        else { throw NestAPIFailure.conflict }
        guard recipient != context.member.userId, snapshot.members.contains(where: { $0.actorId == recipient }) else {
            throw NestAPIFailure.invalid
        }
        guard let offline else { throw NestAPIFailure.configuration }
        let command = RequestChoreTransfer(
            operationId: UUID(), occurrenceId: current.id, expectedDueDate: current.dueDate, recipientId: recipient)
        try await offline.enqueueChoreTransfer(.request(command), title: current.title, lease: context.lease)
        try requireRoutineAccount(context)
    }

    func stageTransferResponse(
        _ pending: PendingChoreTransfer, action: RespondChoreTransfer.Action, context: RoutineCreateContext
    ) async throws {
        try requireRoutineAccount(context)
        guard pending.toMemberId == context.member.userId else { throw NestAPIFailure.forbidden }
        let snapshot = try await readChangeableChores(context)
        guard snapshot.transfers.contains(pending) else { throw NestAPIFailure.conflict }
        guard let offline else { throw NestAPIFailure.configuration }
        let command = RespondChoreTransfer(operationId: UUID(), requestId: pending.requestId, action: action)
        try await offline.enqueueChoreTransfer(.respond(command, pending), title: pending.title, lease: context.lease)
        try requireRoutineAccount(context)
    }
}
