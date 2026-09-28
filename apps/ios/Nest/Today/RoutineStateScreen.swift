import SwiftUI

struct RoutineStateScreen: View {
    @ObservedObject var model: SessionModel
    let routine: HouseholdRoutine?
    @Environment(\.dismiss) private var dismiss
    @State private var currentRoutine: HouseholdRoutine?
    @State private var context: RoutineCreateContext?
    @State private var saved: SavedRoutineState?
    @State private var notice: String?
    @State private var working = false
    @State private var action: RoutineStateCommand.Action?
    @State private var confirming = false

    var body: some View {
        Form {
            if let notice { Section { Text(notice) } }
            if let saved {
                Section(saved.title) {
                    Text("Requested: " + saved.command.action.rawValue.capitalized)
                    if saved.conflicted {
                        Text(
                            "This version could not be changed. Review the current chore before making another change.")
                        Button("Review current chores") { Task { await finish() } }
                    } else if saved.receipt != nil {
                        Text("Change saved.")
                        Button("Done") { Task { await finish() } }
                    } else {
                        Text("Not confirmed. Retry the same saved request when online.")
                        Button("Retry saved change") { Task { await apply(nil) } }
                    }
                }
            } else if let routine = currentRoutine {
                Section(routine.definition.title) {
                    Text("Status: " + routine.state.rawValue.capitalized)
                    NavigationLink("Edit chore") { ChoreEditScreen(model: model, routine: routine) }
                    if routine.state == .active { actionButton("Pause chore", action: .pause) }
                    if routine.state == .paused { actionButton("Resume chore", action: .resume) }
                    if routine.state != .archived { actionButton("Archive chore", action: .archive) }
                }
            } else {
                Section { Text("No saved chore change.") }
            }
        }
        .disabled(working || context == nil)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .navigationTitle("Chore")
        .task { await load() }
        .confirmationDialog("Change this chore?", isPresented: $confirming) {
            if let action {
                Button(action.rawValue.capitalized, role: action == .archive ? .destructive : nil) {
                    Task { await apply(action) }
                }
            }
        } message: {
            Text("This changes the shared household chore. Completed history is kept.")
        }
    }

    private func actionButton(_ title: String, action: RoutineStateCommand.Action) -> some View {
        Button(title, role: action == .archive ? .destructive : nil) {
            self.action = action
            confirming = true
        }
    }

    private func load() async {
        working = true
        defer { working = false }
        do {
            let current = try model.routineCreateContext()
            context = current
            saved = try await model.savedRoutineState(current)
            if saved == nil, let routine {
                let page = try await model.readRoutines(current)
                currentRoutine = page.routines.first { $0.id == routine.id }
                guard currentRoutine != nil else { throw NestAPIFailure.conflict }
            }
            notice = nil
        } catch { notice = "Could not load saved changes. Return to chores and try again." }
    }

    private func apply(_ action: RoutineStateCommand.Action?) async {
        guard !working, let context else { return }
        working = true
        defer { working = false }
        do {
            if let action, let routine = currentRoutine {
                try await model.stageRoutineState(action, routine: routine, context: context)
            }
            saved = try await model.savedRoutineState(context)
            saved = try await model.retryRoutineState(context)
            notice = nil
        } catch {
            saved = try? await model.savedRoutineState(context)
            notice = "Could not finish this change. Return to refresh chores, or retry the saved request."
        }
    }

    private func finish() async {
        guard !working, let context, let saved else { return }
        working = true
        defer { working = false }
        do {
            try await model.finishRoutineState(context, operation: saved.command.operationId)
            dismiss()
        } catch { notice = "Could not finish. Your saved result is kept; try again." }
    }
}
