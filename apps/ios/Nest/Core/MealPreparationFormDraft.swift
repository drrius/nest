import Foundation

struct MealPreparationFormDraft: Equatable {
    var title: String
    var instructions: String
    var dueOn: String
    var policy: String
    var memberId: UUID?
    let baseline: MealPreparationEnvelope

    init(_ baseline: MealPreparationEnvelope) {
        self.baseline = baseline
        title = baseline.preparation?.title ?? ""
        instructions = baseline.preparation?.instructions ?? ""
        dueOn = (baseline.preparation?.dueOn ?? baseline.entry?.date ?? baseline.weekStart.date).value
        switch baseline.preparation?.assignment ?? .shared {
        case .shared: policy = "shared"
        case .assigned(let id):
            policy = "assigned"
            memberId = id
        case .alternating(let id):
            policy = "alternating"
            memberId = id
        }
    }

    func command(operation: UUID) throws -> MealPreparationCommand {
        let assignment = try selectedAssignment()
        let due = try CivilDate(dueOn)
        if let original = baseline.preparation {
            let changedInstructions: String?? =
                instructions == (original.instructions ?? "")
                ? nil : .some(instructions.isEmpty ? nil : instructions)
            let patch = MealPreparationPatch(
                title: title == original.title ? nil : title,
                instructions: changedInstructions, dueOn: due == original.dueOn ? nil : due,
                assignment: assignment == original.assignment ? nil : assignment)
            let command = EditMealPreparation(
                operationId: operation, entryId: baseline.entryId,
                weekStart: baseline.weekStart, expectedRevision: baseline.revision,
                routineId: original.routineId, expectedRoutineVersion: original.routineVersion, patch: patch)
            return .edit(try command.validated(against: baseline))
        }
        let draft = MealPreparationDraft(
            title: title, instructions: instructions.isEmpty ? nil : instructions,
            dueOn: due, assignment: assignment)
        let command = CreateMealPreparation(
            operationId: operation, entryId: baseline.entryId,
            weekStart: baseline.weekStart, expectedRevision: baseline.revision, preparation: draft)
        return .create(try command.validated(against: baseline))
    }

    private func selectedAssignment() throws -> RoutineAssignment {
        switch policy {
        case "shared": return .shared
        case "assigned":
            guard let memberId else { throw MealContractError.invalidPlacement }
            return .assigned(memberId)
        case "alternating":
            guard let memberId else { throw MealContractError.invalidPlacement }
            return .alternating(memberId)
        default: throw MealContractError.invalidPlacement
        }
    }
}
