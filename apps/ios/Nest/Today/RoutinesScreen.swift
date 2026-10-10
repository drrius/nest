import SwiftUI

struct RoutinesScreen: View {
    @ObservedObject var model: SessionModel
    @State private var list: RoutineList?
    @State private var notice: String?
    @State private var working = false
    @State private var hasSavedChange = false
    @State private var hasSavedEdit = false

    var body: some View {
        List {
            Section {
                NavigationLink {
                    ChoreOccurrencesScreen(model: model)
                } label: {
                    Label {
                        Text("Scheduled chores")
                    } icon: {
                        IconTile(systemName: "calendar", domain: .house, solid: true)
                    }
                }
                NavigationLink {
                    ChoreHandoversScreen(model: model)
                } label: {
                    Label {
                        Text("Chore handovers")
                    } icon: {
                        IconTile(systemName: "hand.raised", domain: .bill, solid: true)
                    }
                }
            }
            if let notice {
                Section {
                    Text(notice)
                    Button("Try again") { Task { await load() } }
                }
            }
            if hasSavedChange {
                NavigationLink("Review saved chore change") { RoutineStateScreen(model: model, routine: nil) }
            }
            if hasSavedEdit {
                NavigationLink("Review saved chore edit") { ChoreEditScreen(model: model, routine: nil) }
            }
            if let list {
                if list.routines.isEmpty {
                    ContentUnavailableView(
                        "No chores yet", systemImage: "checklist",
                        description: Text("Add a chore to share what needs doing."))
                }
                let active = list.routines.filter { $0.state == .active }
                let other = list.routines.filter { $0.state != .active }
                if !active.isEmpty { Section("Chores") { ForEach(active) { row($0, members: list.members) } } }
                if !other.isEmpty { Section("Paused or ended") { ForEach(other) { row($0, members: list.members) } } }
            } else if working {
                ProgressView("Loading chores…").frame(maxWidth: .infinity)
            }
        }
        .scrollContentBackground(.hidden)
        .nestScreen()
        .navigationTitle("Household chores")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink {
                    ChoreCreateScreen(model: model)
                } label: {
                    Label("Add chore", systemImage: "plus")
                }
            }
        }
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        guard !working else { return }
        working = true
        defer { working = false }
        do {
            let context = try model.routineCreateContext()
            hasSavedChange = try await model.savedRoutineState(context) != nil
            hasSavedEdit = try await model.savedRoutineEdit(context) != nil
            list = try await model.readRoutines(context)
            notice = nil
        } catch { notice = "Could not refresh chores. Connect and try again." }
    }

    private func row(_ routine: HouseholdRoutine, members: [NestMember]) -> some View {
        NavigationLink {
            RoutineStateScreen(model: model, routine: routine)
        } label: {
            HStack(spacing: 12) {
                AssigneeBadge(kind: badge(routine.definition.assignment), size: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(routine.definition.title).font(.body.weight(.medium)).foregroundStyle(NestColor.ink)
                    Text(
                        schedule(routine.definition.schedule) + " · "
                            + assignment(routine.definition.assignment, members: members)
                    )
                    .font(.footnote).foregroundStyle(NestColor.ink2)
                }
                Spacer(minLength: 4)
                if routine.state != .active { NestPill(text: routine.state.rawValue.capitalized) }
            }
            .padding(.vertical, 2)
        }
    }

    private func badge(_ value: RoutineAssignment) -> AssigneeBadge.Kind {
        switch value {
        case .shared: .shared
        case .assigned(let id): .person(id)
        case .alternating: .turns
        }
    }

    private func assignment(_ value: RoutineAssignment, members: [NestMember]) -> String {
        switch value {
        case .shared: return "Shared"
        case .assigned(let id): return members.first(where: { $0.actorId == id })?.displayName ?? "Household member"
        case .alternating(let id):
            let name = members.first(where: { $0.actorId == id })?.displayName ?? "Household member"
            return "Taking turns · starts with " + name
        }
    }

    private func schedule(_ value: RoutineSchedule) -> String {
        let names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        switch value {
        case .oneOff(let date): return "Once · " + date.value
        case .daily: return "Every day"
        case .weekdays(let days): return days.map { names[$0 - 1] }.joined(separator: ", ")
        case .weekly(let day): return "Every " + names[day - 1]
        case .biweekly(let day): return "Every two weeks · " + names[day - 1]
        case .monthly(let day): return "Monthly · day \(day)"
        case .afterCompletion(let every, let unit): return "\(every) \(unit.rawValue) after completion"
        }
    }
}
