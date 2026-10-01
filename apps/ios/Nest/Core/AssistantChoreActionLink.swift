import Foundation

enum AssistantChoreActionLink: Equatable, Sendable {
    case completion(ChoreCompletion)
    case change(ChoreChangeReceipt)
    case transfer(ChoreTransferReceipt)

    static func read(_ part: [String: AssistantJSON], member: VerifiedMember) -> Self? {
        do {
            let (type, result, input) = try decoded(part)
            switch type {
            case "tool-completeChore": return try completion(result, input: input, member: member)
            case "tool-skipChore", "tool-rescheduleChore":
                let command = try JSONDecoder().decode(ChoreChangeCommand.self, from: input)
                let receipt = try JSONDecoder().decode(ChoreChangeReceipt.self, from: result)
                guard receipt.action == (type == "tool-skipChore" ? "skip" : "reschedule") else { return nil }
                return .change(try receipt.validated(member: member, command: command))
            case "tool-requestChoreTransfer":
                let command = try JSONDecoder().decode(RequestChoreTransfer.self, from: input)
                let receipt = try JSONDecoder().decode(ChoreTransferReceipt.self, from: result)
                return .transfer(try receipt.validated(member: member, command: command))
            case "tool-respondChoreTransfer": return try response(result, input: input, member: member)
            default: return nil
            }
        } catch { return nil }
    }

    private static func decoded(_ part: [String: AssistantJSON]) throws -> (String, Data, Data) {
        guard let type = part["type"]?.string, part["state"] == .string("output-available"),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            case .object(let value) = output["value"], case .object(var input) = part["input"],
            let operation = UUID(uuidString: value["operationId"]?.string ?? "")
        else { throw ChoreContractError.invalidReceipt }
        let keys = try inputKeys(type)
        guard Set(input.keys) == keys, Set(value.keys) == receiptKeys(type) else {
            throw ChoreContractError.invalidReceipt
        }
        input["operationId"] = .string(operation.uuidString)
        let receipt = try JSONEncoder().encode(AssistantJSON.object(value))
        let command = try JSONEncoder().encode(AssistantJSON.object(input))
        return (type, receipt, command)
    }

    private static func receiptKeys(_ type: String) -> Set<String> {
        if type == "tool-completeChore" {
            return ["version", "operationId", "occurrenceId", "completedBy", "completedOn", "outcome"]
        }
        let identity: Set<String> = ["actorId", "householdId", "operationId", "occurrenceId", "action"]
        if ["tool-skipChore", "tool-rescheduleChore"].contains(type) {
            return identity.union(["previousDueDate", "dueDate", "status"])
        }
        return identity.union(["requestId", "dueDate", "fromMemberId", "toMemberId", "state"])
    }

    private static func inputKeys(_ type: String) throws -> Set<String> {
        let occurrence: Set<String> = ["occurrenceId", "expectedDueDate"]
        switch type {
        case "tool-completeChore": return occurrence.union(["completedOn"])
        case "tool-skipChore": return occurrence
        case "tool-rescheduleChore": return occurrence.union(["newDueDate"])
        case "tool-requestChoreTransfer": return occurrence.union(["recipientId"])
        case "tool-respondChoreTransfer": return ["requestId", "action"]
        default: throw ChoreContractError.invalidReceipt
        }
    }

    private static func completion(_ data: Data, input: Data, member: VerifiedMember) throws -> Self {
        let command = try JSONDecoder().decode(CompleteChore.self, from: input)
        let receipt = try JSONDecoder().decode(ChoreCompletion.self, from: data)
        guard receipt.version == 1, receipt.operationId == command.operationId,
            receipt.occurrenceId == command.occurrenceId
        else { throw ChoreContractError.invalidReceipt }
        if receipt.outcome == .completed {
            guard receipt.completedBy == member.userId, receipt.completedOn == command.completedOn else {
                throw ChoreContractError.invalidReceipt
            }
        }
        // Already-completed acknowledgements preserve the actual recorded member/date.
        // Completion has no household field: authorized private transcript provenance
        // supplies scope, and the destination reads the current scoped snapshot.
        return .completion(receipt)
    }

    private static func response(_ data: Data, input: Data, member: VerifiedMember) throws -> Self {
        let command = try JSONDecoder().decode(RespondChoreTransfer.self, from: input)
        let receipt = try JSONDecoder().decode(ChoreTransferReceipt.self, from: data)
        guard receipt.actorId == member.userId, receipt.householdId == member.householdId,
            receipt.operationId == command.operationId, receipt.requestId == command.requestId,
            receipt.toMemberId == member.userId, receipt.fromMemberId != receipt.toMemberId,
            receipt.action == command.action.rawValue,
            receipt.state == (command.action == .accept ? "accepted" : "declined")
        else { throw ChoreContractError.invalidReceipt }
        return .transfer(receipt)
    }
}
