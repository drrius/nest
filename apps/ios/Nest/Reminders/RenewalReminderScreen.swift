import SwiftUI

struct RenewalReminderScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let renewalId: UUID
    @StateObject private var model = RenewalReminderModel()
    @State private var discarding = false
    @State private var leaving = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            if let saved = model.saved {
                RenewalReminderRequestSection(
                    model: model, session: session, member: member, id: renewalId, saved: saved)
            }
            if let renewal = model.renewal {
                Section {
                    Text(renewal.fields.title).font(.headline)
                    Text("Renews \(renewal.fields.renewalOn.value)")
                    Text("Cancel by \(renewal.cancellationOn.value)")
                    if renewal.removed { Text("This renewal was removed from Nest. New reminders cannot be saved.") }
                    if let reviewed = model.baseline?.reminder?.reviewedRenewalRevision, reviewed != renewal.revision {
                        Text(
                            "The renewal changed since this reminder was reviewed. Check the dates and choices before saving again."
                        )
                    }
                }
                Section("Reminder") {
                    Picker("Based on", selection: $model.settings.anchor) {
                        Text("Renewal date").tag(RenewalReminderSettings.Anchor.renewal)
                        Text("Cancellation deadline").tag(RenewalReminderSettings.Anchor.cancellation)
                    }
                    ItemReminderControls(
                        settings: $model.settings.delivery, members: model.members, actor: member.userId)
                }.disabled(model.busy || model.saved != nil || renewal.removed)
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
        .navigationTitle("Renewal reminder")
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
                    Task { await model.load(id: renewalId, session: session, member: member) }
                }
            }
        }
        .task { await model.load(id: renewalId, session: session, member: member) }
        .onChange(of: session.generation) { model.clear() }
        .onDisappear { model.clear() }
    }

    private func refresh() {
        if model.dirty {
            leaving = false
            discarding = true
        } else {
            Task { await model.load(id: renewalId, session: session, member: member) }
        }
    }
}
