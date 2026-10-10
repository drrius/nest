import Foundation

enum AssistantMealPreparationLink {
    static func receipt(_ part: [String: AssistantJSON], member: VerifiedMember) -> MealPreparationReceipt? {
        guard let type = part["type"]?.string,
            ["tool-createMealPreparation", "tool-editMealPreparation"].contains(type),
            part["state"] == .string("output-available"),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            let value = output["value"], let data = try? JSONEncoder().encode(value),
            let receipt = try? JSONDecoder().decode(MealPreparationReceipt.self, from: data),
            receipt.version == 1, receipt.actorId == member.userId, receipt.householdId == member.householdId,
            MealRevision.valid(receipt.revision), ApprovalTime.date(receipt.routineVersion) != nil
        else { return nil }
        if type == "tool-createMealPreparation" { return receipt.previousRoutineVersion == nil ? receipt : nil }
        guard let previous = receipt.previousRoutineVersion, ApprovalTime.date(previous) != nil,
            receipt.routineVersion > previous
        else { return nil }
        return receipt
    }
}
