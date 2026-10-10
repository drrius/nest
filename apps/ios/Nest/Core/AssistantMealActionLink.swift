import Foundation

struct AssistantMealActionLink: Equatable, Sendable {
    enum Action: Sendable { case placed, savedRecipe, replaced, moved, leftovers, removed }
    let weekStart: MealWeekStart
    let entryId: UUID
    let action: Action

    static func read(_ part: [String: AssistantJSON], member: VerifiedMember) -> Self? {
        guard let (type, receipt, command) = try? decoded(part) else { return nil }
        do {
            switch type {
            case "tool-placeMeal": return try placement(receipt, command: command, member: member)
            case "tool-placeRecipe": return try savedRecipe(receipt, command: command, member: member)
            case "tool-replaceMeal": return try replacement(receipt, command: command, member: member)
            case "tool-removeMeal": return try removal(receipt, command: command, member: member)
            case "tool-moveMeal": return try move(receipt, command: command, member: member)
            case "tool-placeLeftovers": return try leftovers(receipt, command: command, member: member)
            default: return nil
            }
        } catch { return nil }
    }

    private static func decoded(_ part: [String: AssistantJSON]) throws -> (String, Data, Data) {
        guard let type = part["type"]?.string, part["state"] == .string("output-available"),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            case .object(let value) = output["value"],
            let operation = UUID(uuidString: value["operationId"]?.string ?? ""),
            let receipt = try? JSONEncoder().encode(AssistantJSON.object(value)),
            case .object(var input) = part["input"], input["operationId"] == nil
        else { throw MealContractError.invalidReceipt }
        input["operationId"] = .string(operation.uuidString)
        let command = try JSONEncoder().encode(AssistantJSON.object(input))
        return (type, receipt, command)
    }

    private static func placement(_ data: Data, command input: Data, member: VerifiedMember) throws -> Self {
        let command = try JSONDecoder().decode(PlaceMeal.self, from: input)
        try validateSlot(command.weekStart, revision: command.expectedRevision, date: command.date)
        try validateTitle(command.title)
        let receipt = try JSONDecoder().decode(MealPlacementReceipt.self, from: data).validated(
            member: member, command: command)
        return Self(weekStart: receipt.weekStart, entryId: receipt.entryId, action: .placed)
    }

    private static func savedRecipe(_ data: Data, command input: Data, member: VerifiedMember) throws -> Self {
        let command = try JSONDecoder().decode(PlaceSavedRecipe.self, from: input)
        try validateSlot(command.weekStart, revision: command.expectedRevision, date: command.date)
        guard MealRevision.valid(command.expectedLibraryRevision) else { throw MealContractError.invalidReceipt }
        let receipt = try JSONDecoder().decode(MealRecipePlacementReceipt.self, from: data).validated(
            member: member, command: command)
        return Self(weekStart: receipt.weekStart, entryId: receipt.entryId, action: .savedRecipe)
    }

    private static func replacement(_ data: Data, command input: Data, member: VerifiedMember) throws -> Self {
        let command = try JSONDecoder().decode(ReplaceMeal.self, from: input)
        try validateSlot(command.weekStart, revision: command.expectedRevision, date: command.date)
        try validateTitle(command.title)
        let receipt = try JSONDecoder().decode(MealReplacementReceipt.self, from: data).validated(
            member: member, command: command)
        return Self(weekStart: receipt.weekStart, entryId: receipt.entryId, action: .replaced)
    }

    private static func removal(_ data: Data, command input: Data, member: VerifiedMember) throws -> Self {
        let command = try JSONDecoder().decode(RemoveMeal.self, from: input)
        guard MealRevision.valid(command.expectedRevision) else { throw MealContractError.invalidReceipt }
        let receipt = try JSONDecoder().decode(MealRemovalReceipt.self, from: data).validated(
            member: member, command: command)
        return Self(weekStart: receipt.weekStart, entryId: receipt.entryId, action: .removed)
    }

    private static func move(_ data: Data, command input: Data, member: VerifiedMember) throws -> Self {
        let command = try JSONDecoder().decode(MoveMeal.self, from: input)
        try validateMove(command)
        let receipt = try JSONDecoder().decode(MealMoveReceipt.self, from: data).validated(
            member: member, command: command)
        return Self(weekStart: receipt.targetWeekStart, entryId: receipt.entryId, action: .moved)
    }

    private static func leftovers(_ data: Data, command input: Data, member: VerifiedMember) throws -> Self {
        let command = try JSONDecoder().decode(PlaceLeftovers.self, from: input)
        try validateMove(command.command)
        let receipt = try JSONDecoder().decode(LeftoverPlacementReceipt.self, from: data).validated(
            member: member, placement: command)
        return Self(weekStart: receipt.targetWeekStart, entryId: receipt.entryId, action: .leftovers)
    }

    private static func validateSlot(_ start: MealWeekStart, revision: String, date: CivilDate) throws {
        guard MealRevision.valid(revision), start.days.contains(date) else { throw MealContractError.invalidReceipt }
    }

    private static func validateTitle(_ title: String) throws {
        guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, MealLibraryText.validTitle(title)
        else { throw MealContractError.invalidReceipt }
    }

    private static func validateMove(_ command: MoveMeal) throws {
        try validateSlot(command.targetWeekStart, revision: command.expectedTargetRevision, date: command.date)
        guard MealRevision.valid(command.expectedSourceRevision),
            command.sourceWeekStart != command.targetWeekStart
                || command.expectedSourceRevision == command.expectedTargetRevision
        else { throw MealContractError.invalidReceipt }
    }
}
