import SwiftUI

struct ReminderTimingText: View {
    let settings: ReminderSettings

    var body: some View {
        Text(
            "\(settings.daysBefore) \(settings.daysBefore == 1 ? "day" : "days") before · \(settings.localTime) Europe/Zurich"
        )
    }
}
