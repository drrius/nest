import Foundation

enum SavedTransferCommand: Codable, Equatable, Sendable {
    case request(RequestChoreTransfer)
    case respond(RespondChoreTransfer, PendingChoreTransfer)

    var operationId: UUID {
        switch self {
        case .request(let command): command.operationId
        case .respond(let command, _): command.operationId
        }
    }

    func validate(actor: UUID) throws {
        switch self {
        case .request(let command):
            guard command.recipientId != actor else { throw OfflineFailure.invalidOperation }
        case .respond(let command, let pending):
            guard command.requestId == pending.requestId, pending.toMemberId == actor,
                pending.fromMemberId != actor, !pending.title.isEmpty
            else { throw OfflineFailure.invalidOperation }
        }
    }

    func validate(receipt: ChoreTransferReceipt, member: VerifiedMember) throws {
        switch self {
        case .request(let command): _ = try receipt.validated(member: member, command: command)
        case .respond(let command, let pending):
            _ = try receipt.validated(member: member, command: command, pending: pending)
        }
    }
}
