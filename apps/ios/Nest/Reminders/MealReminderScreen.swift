import SwiftUI

struct MealReminderScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let entryId: UUID
    @StateObject private var model = MealReminderModel()
    @State private var discarding = false
    @State private var leaving = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            if let saved = model.saved {
                MealReminderRequestSection(
                    model: model, session: session, member: member, id: entryId, saved: saved)
            }
            if let baseline = model.baseline {
                Section {
                    Text(baseline.meal.title).font(.headline)
                    Text("\(baseline.meal.date.value) · \(baseline.meal.slot.label)")
                    if let reviewed = baseline.reminder?.reviewedItemRevision, reviewed != baseline.itemRevision {
                        Text(
                            "The meal changed since this reminder was reviewed. Check the date and choices before saving again."
                        )
                    }
                }
                Section("Reminder") {
                    ItemReminderControls(settings: $model.settings, members: model.members, actor: member.userId)
                }.disabled(model.busy || model.saved != nil)
            }

            Section {
                Text(
                    "Each person can mute item reminders in their notification choices. Push delivery is not available in this build yet."
                )
                .font(.footnote).foregroundStyle(QuietPalette.muted)
                if let notice = model.notice { Text(notice) }
                if model.busy { ProgressView("Checking reminder choices…") }
                Button("Save reminder") { Task { await model.save(session: session, member: member) } }
                    .disabled(!model.canSave)
                Button("Refresh choices") { refresh() }.disabled(model.busy)
            }
        }
        .navigationTitle("Meal reminder")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .navigationBarBackButtonHidden()
        .interactiveDismissDisabled(model.dirty || model.busy)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Back") {
                    if model.dirty {
                        leaving = true
                        discarding = true
                    } else {
                        dismiss()
                    }
                }.disabled(model.busy)
            }
        }
        .confirmationDialog(
            "Discard your unsaved reminder choices?", isPresented: $discarding, titleVisibility: .visible
        ) {
            Button("Discard choices", role: .destructive) {
                if leaving {
                    dismiss()
                } else {
                    Task { await model.load(id: entryId, session: session, member: member) }
                }
            }
        }
        .task { await model.load(id: entryId, session: session, member: member) }
        .onChange(of: session.generation) { model.clear() }
        .onDisappear { model.clear() }
    }

    private func refresh() {
        if model.dirty {
            leaving = false
            discarding = true
        } else {
            Task { await model.load(id: entryId, session: session, member: member) }
        }
    }
}
