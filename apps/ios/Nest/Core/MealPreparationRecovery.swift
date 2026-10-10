import Foundation

enum MealPreparationCommand: Codable, Equatable, Sendable {
    case create(CreateMealPreparation)
    case edit(EditMealPreparation)

    var operationId: UUID {
        switch self {
        case .create(let value): value.operationId
        case .edit(let value): value.operationId
        }
    }

    func validate(_ baseline: MealPreparationEnvelope) throws {
        switch self {
        case .create(let value): _ = try value.validated(against: baseline)
        case .edit(let value): _ = try value.validated(against: baseline)
        }
    }

    func validate(_ receipt: MealPreparationReceipt, member: VerifiedMember, baseline: MealPreparationEnvelope) throws {
        switch self {
        case .create(let value): _ = try receipt.validated(member: member, command: value)
        case .edit(let value):
            _ = try receipt.validated(member: member, command: value)
            guard receipt.occurrenceId == baseline.preparation?.occurrenceId,
                receipt.dueOn == (value.patch.dueOn ?? baseline.preparation?.dueOn)
            else { throw MealContractError.invalidReceipt }
        }
    }

    func matches(_ current: MealPreparation, baseline: MealPreparationEnvelope) -> Bool {
        guard let expected = expectedDraft(baseline) else { return false }
        return current.title == expected.title && current.instructions == expected.instructions
            && current.dueOn == expected.dueOn && current.assignment == expected.assignment
    }

    private func expectedDraft(_ baseline: MealPreparationEnvelope) -> MealPreparationDraft? {
        switch self {
        case .create(let value): return value.preparation
        case .edit(let value):
            guard let original = baseline.preparation else { return nil }
            return MealPreparationDraft(
                title: value.patch.title ?? original.title,
                instructions: value.patch.instructions ?? original.instructions,
                dueOn: value.patch.dueOn ?? original.dueOn, assignment: value.patch.assignment ?? original.assignment)
        }
    }
}

struct SavedMealPreparation: Codable, Equatable, Sendable {
    enum State: String, Codable, Sendable { case pending, acknowledged, conflict }
    let baseline: MealPreparationEnvelope
    let command: MealPreparationCommand
    var state: State
    var receipt: MealPreparationReceipt?

    func validated(_ lease: OfflineLease) throws -> Self {
        _ = try baseline.validated(household: lease.household, week: baseline.weekStart, id: baseline.entryId)
        try command.validate(baseline)
        guard (state == .acknowledged) == (receipt != nil) else { throw OfflineFailure.storage }
        if let receipt {
            let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
            try command.validate(receipt, member: member, baseline: baseline)
        }
        return self
    }

    func reconciles(_ current: MealPreparationEnvelope) -> Bool {
        guard let receipt, let revision = Int64(current.revision), let confirmed = Int64(receipt.revision),
            revision >= confirmed
        else { return false }
        if revision > confirmed { return true }
        guard let preparation = current.preparation, preparation.routineId == receipt.routineId,
            preparation.occurrenceId == receipt.occurrenceId, preparation.routineVersion >= receipt.routineVersion
        else { return false }
        return preparation.routineVersion > receipt.routineVersion || command.matches(preparation, baseline: baseline)
    }
}
