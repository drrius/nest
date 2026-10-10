import Foundation

extension ChoreCreateDraft {
    init(definition: CreateRoutine.Definition) throws {
        self.init()
        title = definition.title
        switch definition.schedule {
        case .oneOff(let civil):
            kind = "one_off"
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyy-MM-dd HH:mm"
            guard let parsed = formatter.date(from: civil.value + " 12:00") else { throw NestAPIFailure.invalid }
            date = parsed
        case .daily: kind = "daily"
        case .weekdays(let selected):
            kind = "weekdays"
            days = Set(selected)
        case .weekly(let day):
            kind = "weekly"
            weekday = day
        case .biweekly(let day):
            kind = "biweekly"
            weekday = day
        case .monthly(let day):
            kind = "monthly"
            dayOfMonth = day
        case .afterCompletion(let interval, let intervalUnit):
            kind = "after_completion"
            every = interval
            unit = intervalUnit
        }
        setAssignment(definition.assignment)
    }

    private mutating func setAssignment(_ assignment: RoutineAssignment) {
        switch assignment {
        case .shared: policy = "shared"
        case .assigned(let id):
            policy = "assigned"
            memberId = id
        case .alternating(let id):
            policy = "alternating"
            memberId = id
        }
    }

    func patch(comparedTo original: CreateRoutine.Definition) throws -> RoutinePatch {
        // Validate only changed title input; unchanged historical titles remain untouched.
        var fields = self
        fields.title = "Chore"
        let definition = try fields.command().definition
        return try RoutinePatch(
            title: title == original.title ? nil : title,
            schedule: definition.schedule == original.schedule ? nil : definition.schedule,
            assignment: definition.assignment == original.assignment ? nil : definition.assignment
        ).validated()
    }
}
