import Foundation

enum AssistantLegacyConfirmationApprovalLink {
    static func read(_ part: [String: AssistantJSON], member: VerifiedMember) -> PendingFinancialApproval? {
        guard part["type"] == .string("tool-proposeLegacyConfirmation"), part["state"] == .string("output-available"),
            case .object(let input) = part["input"], Set(input.keys) == ["draftId", "expense"],
            case .string(let draftId) = input["draftId"], let draft = UUID(uuidString: draftId),
            validExpenseKeys(input["expense"]),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            case .object(let value) = output["value"],
            Set(value.keys) == ["version", "actorId", "householdId", "approval"],
            case .object(let approval) = value["approval"],
            Set(approval.keys) == ["id", "operationId", "input", "status", "expiresAt", "receipt"],
            case .object(let proposed) = approval["input"],
            Set(proposed.keys) == ["draftId", "ruleId", "reviewToken", "expense"],
            validExpenseKeys(proposed["expense"])
        else { return nil }
        do {
            let expense = try JSONDecoder().decode(ExpenseInput.self, from: JSONEncoder().encode(input["expense"]))
            let envelope = try JSONDecoder().decode(
                LegacyConfirmationApprovalEnvelope.self, from: JSONEncoder().encode(AssistantJSON.object(value)))
            _ = try envelope.validated(member: member, approvalId: envelope.approval.id)
            guard envelope.approval.input.draftId == draft, envelope.approval.input.expense == expense else {
                return nil
            }
            return .init(
                approvalId: envelope.approval.id, command: .confirmLegacy, expiresAt: envelope.approval.expiresAt)
        } catch { return nil }
    }

    private static func validExpenseKeys(_ value: AssistantJSON?) -> Bool {
        guard case .object(let expense) = value,
            Set(expense.keys).isSubset(of: [
                "description", "amountCentimes", "payerId", "allocations", "date", "note", "categoryId",
            ]),
            case .array(let shares) = expense["allocations"], shares.count == 2
        else { return false }
        return shares.allSatisfy { share in
            guard case .object(let fields) = share else { return false }
            return Set(fields.keys) == ["memberId", "centimes"]
        }
    }
}
