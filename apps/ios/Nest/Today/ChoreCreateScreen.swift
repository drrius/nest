import SwiftUI

struct ChoreCreateScreen: View {
    @ObservedObject var model: SessionModel
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ChoreCreateDraft()
    @State private var context: RoutineCreateContext?
    @State private var roster: RoutineRoster?
    @State private var saved: SavedRoutineCreation?
    @State private var notice: String?
    @State private var working = false

    var body: some View {
        Form {
            if let notice { Section { Text(notice) } }
            if let saved {
                Section(saved.receipt == nil ? "Saved request" : "Chore added") {
                    Text(saved.command.definition.title).font(.headline)
                    if saved.receipt == nil {
                        Text("This save is not confirmed. Retry the same request when online.")
                        Button("Retry saved request") { Task { await submit() } }
                    } else {
                        Text("Your household chore was saved.")
                        Button("Done") { Task { await finish() } }
                    }
                }
            } else if let roster, roster.members.count == 2 {
                ChoreCreateFields(draft: $draft, members: roster.members)
                Section {
                    Button("Add chore") { Task { await submit() } }
                        .disabled((try? draft.command()) == nil)
                } footer: {
                    Text("Chores stay separate from your household expenses. Connect to save a new chore.")
                }
            } else if roster != nil {
                Section {
                    Text("Chores need both household members to be set up before you can add one.")
                    Button("Check household again") { Task { await load() } }
                }
            } else {
                Section { Button("Load chore form") { Task { await load() } } }
            }
        }
        .disabled(working)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .scrollDismissesKeyboard(.interactively)
        .scrollContentBackground(.hidden)
        .background(QuietPalette.background)
        .navigationTitle("Add chore")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        guard !working else { return }
        working = true
        defer { working = false }
        do {
            let current = try model.routineCreateContext()
            context = current
            saved = try await model.savedRoutineCreation(current)
            if saved == nil { roster = try await model.readRoutineRoster(current) }
            notice = nil
        } catch { notice = "Could not load your household. Connect and try again." }
    }

    private func submit() async {
        guard !working, let context else { return }
        working = true
        defer { working = false }
        do {
            if saved == nil { try await model.stageRoutineCreation(draft.command(), context: context) }
            saved = try await model.savedRoutineCreation(context)
            saved = try await model.retryRoutineCreation(context)
            notice = nil
        } catch {
            saved = try? await model.savedRoutineCreation(context)
            notice =
                saved == nil
                ? "Could not save this chore. Check the form and connection, then try again."
                : "Could not confirm this save. Your original request is kept for retry."
        }
    }

    private func finish() async {
        guard !working, let context, let saved else { return }
        working = true
        defer { working = false }
        do {
            try await model.finishRoutineCreation(context, operation: saved.command.operationId)
            dismiss()
        } catch { notice = "Could not finish. Your confirmed chore is kept; try again." }
    }
}
