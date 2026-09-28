import Foundation

struct RecurringSchedule: Codable, Equatable, Sendable {
    enum Kind: String, Codable { case weekly, monthly }
    let kind: Kind
    let weekday: Int?
    let dayOfMonth: Int?

    var valid: Bool {
        switch kind {
        case .weekly: weekday.map { (1...7).contains($0) } == true && dayOfMonth == nil
        case .monthly: dayOfMonth.map { (1...31).contains($0) } == true && weekday == nil
        }
    }
}

struct RecurringConfiguration: Codable, Equatable, Sendable {
    enum Mode: String, Codable { case fixed, variable }
    let description: String
    let payerId: UUID
    let categoryId: UUID?
    let note: String?
    let startDate: CivilDate
    let schedule: RecurringSchedule
    let mode: Mode
    let amountCentimes: Centimes?
    let allocations: [ExpenseAllocation]?

    func validated(member: VerifiedMember) throws {
        guard schedule.valid, !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            description.unicodeScalars.count <= 200, !description.contains("\0"),
            (note?.unicodeScalars.count ?? 0) <= 4000, !(note?.contains("\0") ?? false)
        else { throw NestAPIFailure.contract }
        switch mode {
        case .variable:
            guard amountCentimes == nil, allocations == nil else { throw NestAPIFailure.contract }
        case .fixed:
            guard let amountCentimes, let allocations else { throw NestAPIFailure.contract }
            _ = try ExpenseInput(
                description: description, amountCentimes: amountCentimes, receiptPath: nil,
                receiptTotalCentimes: nil, payerId: payerId, allocations: allocations, date: startDate,
                note: note, categoryId: categoryId
            ).validated(member: member)
        }
    }
}
