import Foundation

struct AssistantGroceryActionLink: Equatable, Sendable {
    enum Action: Equatable, Sendable { case added, edited, removed, checked(Bool) }
    let itemId: UUID
    let version: String
    let action: Action

    // Grocery receipts have no actor/household fields. Only use these links inside an
    // authorized private transcript, then fetch the current household list before display.
    static func read(_ part: [String: AssistantJSON]) -> Self? {
        do {
            let (type, input, value) = try decoded(part)
            if type == "tool-checkGrocery" { return try check(input: input, value: value) }
            let data = try JSONEncoder().encode(AssistantJSON.object(value))
            let receipt = try JSONDecoder().decode(GroceryWriteReceipt.self, from: data)
            guard validVersion(receipt.version) else { return nil }
            switch type {
            case "tool-addGrocery":
                try fields(input)
                guard !receipt.checked, !receipt.removed else { return nil }
                return Self(itemId: receipt.target, version: receipt.version, action: .added)
            case "tool-editGrocery":
                try fields(input)
                try target(input, id: receipt.target, version: receipt.version, advancing: true)
                guard !receipt.removed else { return nil }
                return Self(itemId: receipt.target, version: receipt.version, action: .edited)
            case "tool-removeGrocery":
                try target(input, id: receipt.target, version: receipt.version, advancing: true)
                guard receipt.removed else { return nil }
                return Self(itemId: receipt.target, version: receipt.version, action: .removed)
            default: return nil
            }
        } catch { return nil }
    }

    private static func decoded(_ part: [String: AssistantJSON]) throws
        -> (String, [String: AssistantJSON], [String: AssistantJSON])
    {
        guard let type = part["type"]?.string, part["state"] == .string("output-available"),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            case .object(let value) = output["value"], case .object(let input) = part["input"],
            UUID(uuidString: value["operation"]?.string ?? "") != nil
        else { throw GroceryContractError.invalidReceipt }
        let keys = try inputKeys(type)
        let outputKeys: Set<String> = ["operation", "target", "version", "checked", "removed"]
        let expected = type == "tool-checkGrocery" ? outputKeys.subtracting(["removed"]).union(["outcome"]) : outputKeys
        guard Set(input.keys) == keys, Set(value.keys) == expected else {
            throw GroceryContractError.invalidReceipt
        }
        return (type, input, value)
    }

    private static func inputKeys(_ type: String) throws -> Set<String> {
        let fields: Set<String> = ["name", "quantity", "unit", "categoryId"]
        switch type {
        case "tool-addGrocery": return fields
        case "tool-editGrocery": return fields.union(["itemId", "expectedVersion"])
        case "tool-removeGrocery": return ["itemId", "expectedVersion"]
        case "tool-checkGrocery": return ["itemId", "expectedVersion", "checked"]
        default: throw GroceryContractError.invalidReceipt
        }
    }

    private static func check(input: [String: AssistantJSON], value: [String: AssistantJSON]) throws -> Self {
        let data = try JSONEncoder().encode(AssistantJSON.object(value))
        let receipt = try JSONDecoder().decode(GroceryCheckReceipt.self, from: data)
        try target(input, id: receipt.target, version: receipt.version, advancing: false)
        guard input["checked"] == .bool(receipt.checked) else { throw GroceryContractError.invalidReceipt }
        return Self(itemId: receipt.target, version: receipt.version, action: .checked(receipt.checked))
    }

    private static func target(
        _ input: [String: AssistantJSON], id: UUID, version: String, advancing: Bool
    ) throws {
        guard UUID(uuidString: input["itemId"]?.string ?? "") == id,
            let expected = input["expectedVersion"]?.string, validVersion(expected), validVersion(version),
            let previous = Int64(expected), let current = Int64(version)
        else { throw GroceryContractError.invalidReceipt }
        guard advancing ? current > previous : current >= previous else { throw GroceryContractError.invalidReceipt }
    }

    static func validVersion(_ value: String) -> Bool { MealRevision.valid(value) && value != "0" }

    private static func fields(_ input: [String: AssistantJSON]) throws {
        guard let name = input["name"]?.string, validName(name),
            optionalText(input["quantity"]), optionalText(input["unit"]), validCategory(input["categoryId"])
        else { throw GroceryContractError.invalidReceipt }
    }

    private static func optionalText(_ value: AssistantJSON?) -> Bool {
        if value == .null { return true }
        guard let text = value?.string else { return false }
        return text.unicodeScalars.count <= 80 && !text.contains("\0")
    }

    private static func validName(_ value: String) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && value.unicodeScalars.count <= 120 && !value.contains("\0")
    }

    private static func validCategory(_ value: AssistantJSON?) -> Bool {
        value == .null || UUID(uuidString: value?.string ?? "") != nil
    }
}
