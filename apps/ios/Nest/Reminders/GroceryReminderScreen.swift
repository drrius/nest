import SwiftUI

struct GroceryReminderScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let itemId: UUID
    @StateObject private var model = GroceryReminderModel()
    @State private var discarding = false
    @State private var leaving = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            if let saved = model.saved {
                GroceryReminderRequestSection(
                    model: model, session: session, member: member, id: itemId, saved: saved)
            }
            if let baseline = model.baseline {
                Section {
                    Text(baseline.grocery.name).font(.headline)
                    Text("Choose the date and time to be reminded about this item.")
                    if baseline.grocery.checked {
                        Text("This item is checked. Uncheck it before saving a new reminder.")
                    }
                    if let reviewed = baseline.reminder?.reviewedItemVersion, reviewed != baseline.itemVersion {
                        Text(
                            "The grocery changed since this reminder was reviewed. Check the date and choices before saving again."
                        )
                    }
                }
                Section("Reminder") {
                    DatePicker(
                        "Reminder date",
                        selection: Binding(
                            get: { ReminderDay.date(model.settings.localDate) },
                            set: { if let date = ReminderDay.day($0) { model.settings.localDate = date } }
                        ), displayedComponents: .date
                    )
                    .environment(\.calendar, ReminderDay.calendar)
                    .environment(\.timeZone, ReminderClock.zone)
                    ItemReminderControls(
                        settings: $model.settings.delivery, members: model.members,
                        actor: member.userId, showsLeadTime: false)
                }.disabled(model.busy || model.saved != nil || baseline.grocery.checked)
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
        .navigationTitle("Grocery reminder")
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
                    Task { await model.load(id: itemId, session: session, member: member) }
                }
            }
        }
        .task { await model.load(id: itemId, session: session, member: member) }
        .onChange(of: session.generation) { model.clear() }
        .onDisappear { model.clear() }
    }

    private func refresh() {
        if model.dirty {
            leaving = false
            discarding = true
        } else {
            Task { await model.load(id: itemId, session: session, member: member) }
        }
    }
}
