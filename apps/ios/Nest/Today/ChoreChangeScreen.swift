import SwiftUI

struct ChoreChangeScreen: View {
    @ObservedObject var model: SessionModel
    let chore: NestChore?
    @Environment(\.dismiss) private var dismiss
    @State private var context: RoutineCreateContext?
    @State private var saved: SavedChoreChange?
    @State private var date = Date()
    @State private var working = false
    @State private var notice: String?
    @State private var confirmingSkip = false

    var body: some View {
        Form {
            if let notice { Section { Text(notice) } }
            if let saved {
                Section(saved.title) {
                    Text(saved.command.newDueDate.map { "Move to " + $0.value } ?? "Skip this occurrence")
                    if saved.conflicted {
                        Text("This chore changed. Review the current schedule before trying again.")
                        Button("Review current chores") { Task { await finish() } }
                    } else if saved.receipt != nil {
                        Text("Change saved.")
                        Button("Done") { Task { await finish() } }
                    } else {
                        Text(working ? "Saving…" : "Not confirmed. Retry the same saved change when online.")
                        Button("Retry saved change") { Task { await apply(newDate: nil) } }
                    }
                }
            } else if let chore {
                Section(chore.title) {
                    Text("Currently due " + chore.dueDate.value)
                    DatePicker("New date", selection: $date, displayedComponents: .date)
                    Button("Move to this date") { Task { await apply(newDate: selectedDate) } }
                        .disabled(selectedDate == nil || selectedDate == chore.dueDate)
                }
                Section {
                    Button("Skip this occurrence", role: .destructive) { confirmingSkip = true }
                    Text("Only this occurrence changes. The routine and completed history are kept.").font(.footnote)
                }
            } else {
                Text("No saved change.")
            }
        }
        .disabled(working || context == nil)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .navigationTitle("Scheduled chore")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .task { await load() }
        .confirmationDialog("Skip this occurrence?", isPresented: $confirmingSkip) {
            Button("Skip occurrence", role: .destructive) { Task { await apply(newDate: nil) } }
        } message: {
            Text("It will be recorded as skipped, not completed.")
        }
    }

    private var formatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }

    private var selectedDate: CivilDate? { try? CivilDate(formatter.string(from: date)) }

    private func load() async {
        guard context == nil else { return }
        working = true
        defer { working = false }
        do {
            let current = try model.routineCreateContext()
            context = current
            saved = try await model.savedChoreChange(current)
            if let chore, let parsed = formatter.date(from: chore.dueDate.value) { date = parsed }
        } catch { notice = "Could not load saved changes. Return to scheduled chores and try again." }
    }

    private func apply(newDate: CivilDate?) async {
        guard !working, let context else { return }
        working = true
        defer { working = false }
        do {
            if saved == nil, let chore {
                try await model.stageChoreChange(chore, newDueDate: newDate, context: context)
            }
            saved = try await model.savedChoreChange(context)
            saved = try await model.retryChoreChange(context)
            notice = nil
        } catch {
            saved = try? await model.savedChoreChange(context)
            notice = "Could not finish. Retry saved changes, or return to refresh this chore."
        }
    }

    private func finish() async {
        guard !working, let context, let saved else { return }
        working = true
        defer { working = false }
        do {
            try await model.finishChoreChange(context, operation: saved.command.operationId)
            dismiss()
        } catch { notice = "Could not finish. Your result is kept; try again." }
    }
}
