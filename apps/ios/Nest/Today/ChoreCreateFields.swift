import SwiftUI

struct ChoreCreateDraft {
    var title = ""
    var kind = "one_off"
    var date = Date()
    var weekday = 1
    var days: Set<Int> = [1]
    var dayOfMonth = 1
    var every = 1
    var unit = RoutineSchedule.IntervalUnit.days
    var policy = "shared"
    var memberId: UUID?

    func command() throws -> CreateRoutine {
        let schedule: RoutineSchedule
        switch kind {
        case "daily": schedule = .daily
        case "weekdays": schedule = .weekdays(days.sorted())
        case "weekly": schedule = .weekly(weekday)
        case "biweekly": schedule = .biweekly(weekday)
        case "monthly": schedule = .monthly(dayOfMonth)
        case "after_completion": schedule = .afterCompletion(every: every, unit: unit)
        default:
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyy-MM-dd"
            schedule = .oneOff(try CivilDate(formatter.string(from: date)))
        }
        let assignment: RoutineAssignment
        if policy == "shared" {
            assignment = .shared
        } else {
            guard let memberId else { throw NestAPIFailure.invalid }
            assignment = policy == "assigned" ? .assigned(memberId) : .alternating(memberId)
        }
        return try CreateRoutine(operationId: UUID(), title: title, schedule: schedule, assignment: assignment)
    }
}

struct ChoreCreateFields: View {
    @Binding var draft: ChoreCreateDraft
    let members: [NestMember]
    private let weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    var body: some View {
        Section("Chore") {
            TextField("What needs doing?", text: $draft.title)
            Picker("Repeat", selection: $draft.kind) {
                Text("Once").tag("one_off")
                Text("Every day").tag("daily")
                Text("Selected weekdays").tag("weekdays")
                Text("Weekly").tag("weekly")
                Text("Every two weeks").tag("biweekly")
                Text("Monthly").tag("monthly")
                Text("After completion").tag("after_completion")
            }
            scheduleFields
        }
        Section("Who handles it?") {
            Picker("Assignment", selection: $draft.policy) {
                Text("Shared").tag("shared")
                Text("One person").tag("assigned")
                Text("Take turns").tag("alternating")
            }
            if draft.policy != "shared" {
                Picker(draft.policy == "alternating" ? "First turn" : "Person", selection: $draft.memberId) {
                    Text("Choose a person").tag(UUID?.none)
                    ForEach(members, id: \.actorId) { member in
                        Text(member.displayName).tag(Optional(member.actorId))
                    }
                }
            }
        }
    }

    @ViewBuilder private var scheduleFields: some View {
        switch draft.kind {
        case "one_off": DatePicker("Due", selection: $draft.date, displayedComponents: .date)
        case "weekly", "biweekly":
            Picker("Day", selection: $draft.weekday) {
                ForEach(1...7, id: \.self) { day in Text(weekdays[day - 1]).tag(day) }
            }
        case "weekdays":
            ForEach(1...7, id: \.self) { day in
                Toggle(
                    weekdays[day - 1],
                    isOn: Binding(
                        get: { draft.days.contains(day) },
                        set: { enabled in
                            if enabled { draft.days.insert(day) } else { draft.days.remove(day) }
                        }))
            }
        case "monthly": Stepper("Day \(draft.dayOfMonth)", value: $draft.dayOfMonth, in: 1...31)
        case "after_completion":
            Stepper("Every \(draft.every)", value: $draft.every, in: 1...2_147_483_647)
            Picker("Unit", selection: $draft.unit) {
                Text("Days").tag(RoutineSchedule.IntervalUnit.days)
                Text("Weeks").tag(RoutineSchedule.IntervalUnit.weeks)
            }
        default: EmptyView()
        }
    }
}
