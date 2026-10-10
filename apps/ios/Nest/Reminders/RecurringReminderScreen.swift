import SwiftUI

struct RecurringReminderScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let ruleId: UUID
    @StateObject private var model = RecurringReminderModel()
    @State private var discarding = false
    @State private var leaving = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            if let saved = model.saved {
                RecurringReminderRequestSection(
                    model: model, session: session, member: member, id: ruleId, saved: saved)
            }
            if let baseline = model.baseline {
                Section {
                    Text(baseline.rule.configuration.description).font(.headline)
                    if let due = baseline.rule.nextDueOn { Text("Next due \(due.value)") }
                    if baseline.rule.status != .active || baseline.rule.nextDueOn == nil {
                        Text("Only an active rule with a next due date can save reminder choices.")
                    }
                    if let previous = baseline.reminder,
                        previous.reviewedRuleRevision != baseline.rule.revision
                            || previous.reviewedDueOn != baseline.rule.nextDueOn
                    {
                        Text(
                            "The rule or next due date changed since this reminder was reviewed. Check the current details before saving again."
                        )
                    }
                }
                Section("Reminder") {
                    ItemReminderControls(settings: $model.settings, members: model.members, actor: member.userId)
                }.disabled(
                    model.busy || model.saved != nil || baseline.rule.status != .active
                        || baseline.rule.nextDueOn == nil)
            }

            Section {
                Text(
                    "Each person can mute item reminders in their notification choices. Push delivery is not available in this build yet."
                )
                .font(.footnote).foregroundStyle(QuietPalette.muted)
                Text("Reminder choices do not approve a bill, change its rule or record an expense.")
                    .font(.footnote).foregroundStyle(QuietPalette.muted)
                if let notice = model.notice { Text(notice) }
                if model.busy { ProgressView("Checking reminder choices…") }
                Button("Save reminder") { Task { await model.save(session: session, member: member) } }
                    .disabled(!model.canSave)
                Button("Refresh choices") { refresh() }.disabled(model.busy)
            }
        }
        .navigationTitle("Bill reminder")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .navigationBarBackButtonHidden()
        .interactiveDismissDisabled(model.dirty || model.busy)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                QuietToolbarButton("Back", systemImage: "chevron.left") {
                    if model.dirty {
                        leaving = true
                        discarding = true
                    } else {
                        dismiss()
                    }
                }.disabled(model.busy)
            }
        }
        .alert("Discard changes?", isPresented: $discarding) {
            Button("Keep editing", role: .cancel) {}
            Button("Discard choices", role: .destructive) {
                if leaving {
                    dismiss()
                } else {
                    Task { await model.load(id: ruleId, session: session, member: member) }
                }
            }
        }
        .task { await model.load(id: ruleId, session: session, member: member) }
        .onChange(of: session.generation) { model.clear() }
        .onDisappear { model.clear() }
    }

    private func refresh() {
        if model.dirty {
            leaving = false
            discarding = true
        } else {
            Task { await model.load(id: ruleId, session: session, member: member) }
        }
    }
}
