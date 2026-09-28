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
    @State private var confirmCancel = false

    var body: some View {
        Form {
            if let notice { Section { Text(notice) } }
            if let saved {
                Section(
                    saved.cancellation?.status == .cancelled
                        ? "Save cancelled" : saved.receipt == nil ? "Saved request" : "Chore added"
                ) {
                    Text(saved.command.definition.title).font(.headline)
                    if saved.cancellation?.status == .cancelled {
                        Text("This request did not create a chore.")
                        Button("Done") { Task { await finish() } }
                    } else if saved.receipt == nil {
                        Text(
                            saved.cancellationRequested == true
                                ? "Cancellation is not confirmed. Retry to check the outcome."
                                : "This save is not confirmed. Retry the same request when online.")
                        Button("Retry saved request") { Task { await submit() } }
                        if saved.cancellationRequested != true {
                            Button("Cancel pending save", role: .destructive) { confirmCancel = true }
                        }
                    } else {
                        Text("Your household chore was saved.")
                        Button("Done") { Task { await finish() } }
                    }
                }
            } else if let roster, roster.members.count == 2 {
                ChoreCreateFields(draft: $draft, members: roster.members)
                if draft.kind == "one_off" { SchedulingWarningSection(session: model, day: draft.date) }
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
        .confirmationDialog("Cancel this pending save?", isPresented: $confirmCancel) {
            Button("Cancel pending save", role: .destructive) { Task { await cancel() } }
        } message: {
            Text("Nest checks with the server. If the chore was already created, it is kept.")
        }
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

    private func cancel() async {
        guard !working, let context else { return }
        working = true
        defer { working = false }
        do {
            saved = try await model.cancelRoutineCreation(context)
            notice = nil
        } catch {
            saved = try? await model.savedRoutineCreation(context)
            notice = "Could not confirm cancellation. Retry when online to check the outcome."
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
