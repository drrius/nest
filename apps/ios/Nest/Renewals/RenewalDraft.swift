import Foundation

struct RenewalDraft: Equatable {
    var title = ""
    var date: Date = .now
    var noticeDays = 0
    var responsibleId: UUID?
    var recurringRuleId: UUID?

    init(renewal: CalendarRenewal?) {
        guard let renewal else { return }
        title = renewal.fields.title
        date = Self.formatter.date(from: renewal.fields.renewalOn.value)!
        noticeDays = renewal.fields.noticeDays
        responsibleId = renewal.fields.responsibleId
        recurringRuleId = renewal.fields.recurringRuleId
    }

    func fields() throws -> CalendarRenewal.Fields {
        try CalendarRenewal.Fields(
            title: title.trimmingCharacters(in: TextWhitespace.ecmaScript),
            renewalOn: CivilDate(Self.formatter.string(from: date)), noticeDays: noticeDays,
            responsibleId: responsibleId, recurringRuleId: recurringRuleId
        ).validated(edited: true)
    }

    static var formatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }
}
