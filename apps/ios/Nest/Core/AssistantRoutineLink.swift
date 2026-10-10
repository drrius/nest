import Foundation

enum AssistantRoutineLink {
    static func receipt(_ part: [String: AssistantJSON], member: VerifiedMember) -> RoutineCreateReceipt? {
        do {
            let (type, result, input) = try decoded(part)
            switch type {
            case "tool-createRoutine":
                let command = try JSONDecoder().decode(CreateRoutine.self, from: input).validated()
                guard validTitle(command.definition.title) else { return nil }
                return try result.validated(member: member, command: command)
            case "tool-editRoutine":
                let command = try JSONDecoder().decode(EditRoutine.self, from: input).validated()
                guard result.version >= command.expectedVersion else { return nil }
                return try result.validated(member: member, command: command)
            case "tool-setRoutineState":
                let command = try JSONDecoder().decode(RoutineStateCommand.self, from: input).validated()
                // A repeated pause/resume/archive may be a valid no-op at this exact version.
                guard result.version >= command.expectedVersion else { return nil }
                return try result.validated(member: member, command: command)
            default: return nil
            }
        } catch { return nil }
    }

    private static func decoded(_ part: [String: AssistantJSON]) throws -> (String, RoutineCreateReceipt, Data) {
        guard let type = part["type"]?.string, part["state"] == .string("output-available"),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            case .object(let value) = output["value"], case .object(var input) = part["input"]
        else { throw ChoreContractError.invalidReceipt }
        let keys = try inputKeys(type)
        let receiptKeys: Set<String> = ["actorId", "householdId", "operationId", "routineId", "version", "action"]
        guard Set(input.keys) == keys, Set(value.keys) == receiptKeys else { throw ChoreContractError.invalidReceipt }
        if type == "tool-editRoutine" { try patch(input["patch"]) }
        let result = try JSONDecoder().decode(
            RoutineCreateReceipt.self, from: JSONEncoder().encode(AssistantJSON.object(value)))
        input["operationId"] = .string(result.operationId.uuidString)
        return (type, result, try JSONEncoder().encode(AssistantJSON.object(input)))
    }

    private static func inputKeys(_ type: String) throws -> Set<String> {
        switch type {
        case "tool-createRoutine": return ["definition"]
        case "tool-editRoutine": return ["routineId", "expectedVersion", "patch"]
        case "tool-setRoutineState": return ["routineId", "expectedVersion", "action"]
        default: throw ChoreContractError.invalidReceipt
        }
    }

    private static func patch(_ value: AssistantJSON?) throws {
        guard case .object(let fields) = value, !fields.isEmpty,
            Set(fields.keys).isSubset(of: ["title", "schedule", "assignment"]),
            !fields.values.contains(.null)
        else { throw ChoreContractError.invalidReceipt }
        if let title = fields["title"] {
            guard let value = title.string, validTitle(value) else { throw ChoreContractError.invalidReceipt }
        }
    }

    private static func validTitle(_ value: String) -> Bool {
        !value.trimmingCharacters(in: TextWhitespace.ecmaScript).isEmpty
            && value.utf16.count <= 120 && !value.contains("\0")
    }
}
