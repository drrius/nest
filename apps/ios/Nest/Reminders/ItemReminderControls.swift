import SwiftUI

struct ItemReminderControls: View {
    @Binding var settings: ReminderSettings
    let members: [NestMember]
    let actor: UUID

    var body: some View {
        Toggle("Reminder enabled", isOn: $settings.enabled)
        Group {
            ForEach(members, id: \.actorId) { member in
                Toggle(
                    member.actorId == actor ? "Remind me" : "Remind \(member.displayName)",
                    isOn: Binding(
                        get: { settings.recipientIds.contains(member.actorId) },
                        set: { enabled in
                            settings.recipientIds.removeAll { $0 == member.actorId }
                            if enabled { settings.recipientIds.append(member.actorId) }
                            settings = settings.canonical()
                        }))
            }
            DatePicker(
                "Time · Europe/Zurich",
                selection: Binding(
                    get: { ReminderClock.date(settings.localTime) },
                    set: { settings.localTime = ReminderClock.text($0) }), displayedComponents: .hourAndMinute
            )
            .environment(\.timeZone, ReminderClock.zone)
            Stepper("Days before: \(settings.daysBefore)", value: $settings.daysBefore, in: 0...730)
        }.disabled(!settings.enabled)
        if settings.enabled && settings.recipientIds.isEmpty {
            Text("Choose at least one person before saving.").font(.footnote).foregroundStyle(QuietPalette.muted)
        }
    }
}

enum ReminderClock {
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
