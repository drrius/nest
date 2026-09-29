import SwiftUI

struct NotificationPreferencesScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @StateObject private var model = NotificationPreferencesModel()
    @State private var discard = false

    var body: some View {
        Form {
            Section {
                Text("Choose what Nest may send to you. Your partner has separate choices.")
                Text("Saving these choices does not grant iPhone notification permission.")
                    .foregroundStyle(QuietPalette.muted)
            }
            if current {
                if let saved = model.saved { recovery(saved) }
                Section("Daily summary") {
                    Toggle("One daily summary", isOn: $model.preferences.dailySummaryEnabled)
                    DatePicker("Time", selection: summaryTime, displayedComponents: .hourAndMinute)
                        .environment(\.timeZone, NotificationClock.zone)
                        .disabled(!model.preferences.dailySummaryEnabled)
                    Text("Times use Europe/Zurich, including daylight saving changes.")
                        .font(.footnote).foregroundStyle(QuietPalette.muted)
                }.disabled(!editable)
                Section("Item reminders") {
                    Toggle("Receive item reminders", isOn: $model.preferences.itemRemindersEnabled)
                    Text("Turning this off mutes reminders addressed to you, including ones chosen by your partner.")
                        .font(.footnote).foregroundStyle(QuietPalette.muted)
                }.disabled(!editable)
            }
            if let notice = model.notice { Text(notice).foregroundStyle(QuietPalette.muted) }
            if model.busy { ProgressView("Checking choices…") }
            Section {
                Button("Reload choices") { Task { await model.load(session: session, member: member) } }
                    .disabled(model.busy)
                Text("Notification delivery is not available in this build yet.")
                    .font(.footnote).foregroundStyle(QuietPalette.muted)
            }
        }
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden).background(QuietPalette.background).tint(QuietPalette.accent)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await model.save(session: session, member: member) } }.disabled(!editable)
            }
        }
        .task { await model.load(session: session, member: member) }
        .onDisappear { model.clear() }
        .confirmationDialog("Discard this rejected save?", isPresented: $discard) {
            Button("Discard rejected request", role: .destructive) {
                Task { await model.finish(session: session, member: member) }
            }
        } message: {
            Text("Reload and review the current choices before saving again.")
        }
    }

    private var current: Bool { session.status == .ready(member) }
    private var editable: Bool { current && !model.busy && model.baseline != nil && model.saved == nil }

    private var summaryTime: Binding<Date> {
        Binding(
            get: { NotificationClock.date(model.preferences.dailySummaryTime) },
            set: { model.preferences.dailySummaryTime = NotificationClock.text($0) })
    }

    @ViewBuilder private func recovery(_ saved: SavedNotificationPreference) -> some View {
        Section("Saved choice") {
            switch saved.state {
            case .pending:
                Text("This save is not confirmed. Retry the same request when connected.")
                Button("Retry save") { Task { await model.retry(session: session, member: member) } }
            case .acknowledged:
                Text("Nest confirmed this save. Reload to see your current choices.")
                Button("Continue") { Task { await model.finish(session: session, member: member) } }
            case .conflict:
                Text(
                    "Your choices changed, or this request was rejected. Review the current choices before saving again."
                )
                Button("Discard rejected request") { discard = true }
            }
        }.disabled(model.busy)
    }
}

private enum NotificationClock {
    static let zone = TimeZone(identifier: "Europe/Zurich")!
    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return calendar
    }

    static func date(_ text: String) -> Date {
        let parts = text.split(separator: ":").compactMap { Int($0) }
        return calendar.date(from: DateComponents(year: 2001, month: 1, day: 1, hour: parts[0], minute: parts[1]))!
    }

    static func text(_ date: Date) -> String {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", parts.hour!, parts.minute!)
    }
}
