import Foundation

extension CalendarRenewal.Fields {
    enum CodingKeys: String, CodingKey { case title, renewalOn, noticeDays, responsibleId, recurringRuleId }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(title, forKey: .title)
        try values.encode(renewalOn, forKey: .renewalOn)
        try values.encode(noticeDays, forKey: .noticeDays)
        try values.encode(responsibleId, forKey: .responsibleId)
        try values.encode(recurringRuleId, forKey: .recurringRuleId)
    }

    func validated(edited: Bool) throws -> Self {
        let stored = title.trimmingCharacters(in: .init(charactersIn: " "))
        guard (1...160).contains(stored.unicodeScalars.count), cancellationDeadline != nil else {
            throw NestAPIFailure.invalid
        }
        if edited {
            guard title == title.trimmingCharacters(in: TextWhitespace.ecmaScript)
            else { throw NestAPIFailure.invalid }
        }
        return self
    }

    var cancellationDeadline: CivilDate? {
        guard (0...730).contains(noticeDays) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let parts = renewalOn.value.split(separator: "-").compactMap { Int($0) }
        guard let renewal = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])),
            let deadline = calendar.date(byAdding: .day, value: -noticeDays, to: renewal)
        else { return nil }
        let components = calendar.dateComponents([.era, .year, .month, .day], from: deadline)
        guard components.era == 1, let year = components.year, (1...9999).contains(year),
            let month = components.month, let day = components.day
        else { return nil }
        return try? CivilDate(String(format: "%04d-%02d-%02d", year, month, day))
    }
}

extension CalendarRenewal {
    func validated() throws -> Self {
        _ = try fields.validated(edited: false)
        guard cancellationOn == fields.cancellationDeadline else { throw NestAPIFailure.contract }
        return self
    }
}
