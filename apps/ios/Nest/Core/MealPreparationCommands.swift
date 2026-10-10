import Foundation

public struct CreateMealPreparation: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let entryId: UUID
    public let weekStart: MealWeekStart
    public let expectedRevision: String
    public let preparation: MealPreparationDraft

    func validated(against baseline: MealPreparationEnvelope? = nil) throws -> Self {
        _ = try preparation.validated()
        guard MealRevision.valid(expectedRevision) else { throw MealContractError.invalidPlacement }
        if let baseline {
            _ = try baseline.validated(
                household: baseline.householdId, week: weekStart, id: entryId, revision: expectedRevision)
            guard baseline.entry != nil, baseline.preparation == nil else { throw MealContractError.invalidPlacement }
        }
        return self
    }
}

public struct MealPreparationPatch: Codable, Equatable, Sendable {
    public var title: String?
    public var instructions: String??
    public var dueOn: CivilDate?
    public var assignment: RoutineAssignment?

    enum CodingKeys: String, CodingKey { case title, instructions, dueOn, assignment }

    public init(
        title: String? = nil, instructions: String?? = nil, dueOn: CivilDate? = nil,
        assignment: RoutineAssignment? = nil
    ) {
        self.title = title
        self.instructions = instructions
        self.dueOn = dueOn
        self.assignment = assignment
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        title = try values.decodeIfPresent(String.self, forKey: .title)
        instructions =
            values.contains(.instructions) ? .some(try values.decodeIfPresent(String.self, forKey: .instructions)) : nil
        dueOn = try values.decodeIfPresent(CivilDate.self, forKey: .dueOn)
        assignment = try values.decodeIfPresent(RoutineAssignment.self, forKey: .assignment)
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encodeIfPresent(title, forKey: .title)
        if let instructions { try values.encode(instructions, forKey: .instructions) }
        try values.encodeIfPresent(dueOn, forKey: .dueOn)
        try values.encodeIfPresent(assignment, forKey: .assignment)
    }

    func validated() throws {
        guard title != nil || instructions != nil || dueOn != nil || assignment != nil else {
            throw MealContractError.invalidPlacement
        }
        guard title.map(MealPreparationDraft.validTitle) ?? true,
            MealPreparationDraft.validInstructions(instructions.flatMap { $0 })
        else { throw MealContractError.invalidPlacement }
    }
}

public struct EditMealPreparation: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let entryId: UUID
    public let weekStart: MealWeekStart
    public let expectedRevision: String
    public let routineId: UUID
    public let expectedRoutineVersion: String
    public let patch: MealPreparationPatch

    func validated(against baseline: MealPreparationEnvelope? = nil) throws -> Self {
        try patch.validated()
        guard MealRevision.valid(expectedRevision), ApprovalTime.date(expectedRoutineVersion) != nil
        else { throw MealContractError.invalidPlacement }
        if let baseline { try validateBaseline(baseline) }
        return self
    }

    private func validateBaseline(_ baseline: MealPreparationEnvelope) throws {
        _ = try baseline.validated(
            household: baseline.householdId, week: weekStart, id: entryId, revision: expectedRevision)
        guard baseline.entry != nil, let preparation = baseline.preparation,
            preparation.routineId == routineId, preparation.routineVersion == expectedRoutineVersion,
            preparation.state != .archived
        else { throw MealContractError.invalidPlacement }
        guard preparation.status == .open || (patch.dueOn == nil && patch.assignment == nil)
        else { throw MealContractError.invalidPlacement }
    }
}
