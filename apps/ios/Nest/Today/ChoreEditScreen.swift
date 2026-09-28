import SwiftUI

struct ChoreEditScreen: View {
    @ObservedObject var model: SessionModel
    let routine: HouseholdRoutine?
    @Environment(\.dismiss) private var dismiss
    @State private var context: RoutineCreateContext?
    @State private var saved: SavedRoutineEdit?
    @State private var draft = ChoreCreateDraft()
    @State private var members: [NestMember] = []
    @State private var notice: String?
    @State private var working = false
    @State private var loaded = false

    var body: some View {
        Form {
            if let notice { Section { Text(notice) } }
            if let saved {
                Section(saved.title) {
                    if saved.conflicted {
                        Text("This chore changed. Review its current details before editing again.")
                        Button("Review current chores") { Task { await finish() } }
                    } else if saved.receipt != nil {
                        Text("Changes saved.")
                        Button("Done") { Task { await finish() } }
                    } else {
                        Text(working ? "Saving changes…" : "Not confirmed. Retry your saved changes when online.")
                        Button("Retry saved changes") { Task { await save() } }
                    }
                }
            } else if loaded, let routine {
                ChoreCreateFields(draft: $draft, members: members)
                Section {
                    Button("Save changes") { Task { await save() } }
                        .disabled((try? draft.patch(comparedTo: routine.definition)) == nil)
                    Text("Changes apply to upcoming work. Completed history is kept.").font(.footnote)
                }
            } else if !working {
                Section { Button("Reload") { Task { await load() } } }
            }
        }
        .disabled(working || context == nil)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .scrollDismissesKeyboard(.interactively)
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .navigationTitle("Edit chore")
        .task { if !loaded { await load() } }
    }

    private func load() async {
        guard !working else { return }
        working = true
        defer { working = false }
        do {
            let current = try model.routineCreateContext()
            context = current
            saved = try await model.savedRoutineEdit(current)
            if saved == nil, let routine {
                let page = try await model.readRoutines(current)
                guard page.routines.contains(where: { $0.id == routine.id && $0.version == routine.version }) else {
                    throw NestAPIFailure.conflict
                }
                members = page.members
                draft = try ChoreCreateDraft(definition: routine.definition)
            }
            loaded = true
            notice = nil
        } catch { notice = "Could not load this version. Return to chores and refresh before editing." }
    }

    private func save() async {
        guard !working, let context else { return }
        working = true
        defer { working = false }
        do {
            if saved == nil, let routine {
                try await model.stageRoutineEdit(
                    draft.patch(comparedTo: routine.definition), routine: routine, context: context)
            }
            saved = try await model.savedRoutineEdit(context)
            saved = try await model.retryRoutineEdit(context)
            notice = nil
        } catch {
            saved = try? await model.savedRoutineEdit(context)
            notice = "Could not finish saving. Retry saved changes, or return to refresh the chore."
        }
    }

    private func finish() async {
        guard !working, let context, let saved else { return }
        working = true
        defer { working = false }
        do {
            try await model.finishRoutineEdit(context, operation: saved.command.operationId)
            dismiss()
        } catch { notice = "Could not finish. Your saved result is kept; try again." }
    }
}
