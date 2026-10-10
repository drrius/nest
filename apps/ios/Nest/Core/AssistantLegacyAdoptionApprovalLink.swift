import Foundation

enum AssistantLegacyAdoptionApprovalLink {
    static func read(_ part: [String: AssistantJSON], member: VerifiedMember) -> PendingFinancialApproval? {
        guard part["type"] == .string("tool-proposeLegacyAdoption"), part["state"] == .string("output-available"),
            case .object(let input) = part["input"], Set(input.keys) == ["ruleId", "configuration"],
            case .string(let ruleId) = input["ruleId"], let rule = UUID(uuidString: ruleId),
            validConfiguration(input["configuration"]),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            case .object(let value) = output["value"],
            Set(value.keys) == ["version", "actorId", "householdId", "approval"],
            case .object(let approval) = value["approval"],
            Set(approval.keys) == ["id", "operationId", "input", "status", "expiresAt", "receipt"],
            case .object(let proposed) = approval["input"],
            Set(proposed.keys) == ["ruleId", "reviewToken", "configuration", "firstDueOn"],
            validConfiguration(proposed["configuration"])
        else { return nil }
        do {
            let configuration = try JSONDecoder().decode(
                RecurringConfiguration.self,
                from: JSONEncoder().encode(input["configuration"]))
            let envelope = try JSONDecoder().decode(
                LegacyAdoptionApprovalEnvelope.self,
                from: JSONEncoder().encode(AssistantJSON.object(value)))
            _ = try envelope.validated(member: member, approvalId: envelope.approval.id)
            guard envelope.approval.input.ruleId == rule, envelope.approval.input.configuration == configuration else {
                return nil
            }
            return .init(
                approvalId: envelope.approval.id, command: .adoptLegacy, expiresAt: envelope.approval.expiresAt)
        } catch { return nil }
    }

    private static func validConfiguration(_ raw: AssistantJSON?) -> Bool {
        guard case .object(let config) = raw,
            Set(config.keys).isSubset(of: [
                "description", "payerId", "categoryId", "note", "startDate", "schedule",
                "mode", "amountCentimes", "allocations",
            ]),
            validSchedule(config["schedule"])
        else { return false }
        if config["mode"] == .string("variable") {
            return config["amountCentimes"] == .null && config["allocations"] == .null
        }
        guard case .array(let allocations) = config["allocations"], allocations.count == 2 else { return false }
        return allocations.allSatisfy {
            guard case .object(let share) = $0 else { return false }
            return Set(share.keys) == ["memberId", "centimes"]
        }
    }

    private static func validSchedule(_ raw: AssistantJSON?) -> Bool {
        guard case .object(let schedule) = raw else { return false }
        let keys: Set<String> = schedule["kind"] == .string("weekly") ? ["kind", "weekday"] : ["kind", "dayOfMonth"]
        return Set(schedule.keys) == keys
    }
}
