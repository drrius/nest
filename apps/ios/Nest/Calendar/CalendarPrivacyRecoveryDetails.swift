import SwiftUI

struct CalendarPrivacyRecoveryDetails: View {
    @ObservedObject var session: SessionModel
    @Environment(\.dismiss) private var dismiss
    private let reader = EventKitCalendarReader()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Busy sharing removal is not confirmed.")
                        .font(.title2.weight(.semibold))
                    Text("Shared times may remain visible until removal succeeds or they expire. Try again online.")
                        .foregroundStyle(QuietPalette.muted)
                    Button {
                        Task { await session.refreshCalendarPrivacy(access: reader.access) }
                    } label: {
                        QuietActionLabel(session.calendarPrivacyRemoving ? "Removing…" : "Retry removal")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(QuietPalette.accent)
                    .foregroundStyle(QuietPalette.onAccent)
                    .disabled(session.calendarPrivacyRemoving)
                }
                .foregroundStyle(QuietPalette.ink)
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(QuietPalette.background)
            .navigationTitle("Privacy")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                }
            }
        }
        .tint(QuietPalette.accent)
        .presentationDragIndicator(.visible)
    }
}
