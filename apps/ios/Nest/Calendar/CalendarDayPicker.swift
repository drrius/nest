import SwiftUI

struct CalendarDayPicker: View {
    @Binding var day: Date
    @State private var presented = false

    var body: some View {
        Button {
            presented = true
        } label: {
            HStack(spacing: 12) {
                Text("Day").foregroundStyle(QuietPalette.ink)
                Spacer(minLength: 8)
                Text(day.formatted(date: .abbreviated, time: .omitted)).foregroundStyle(QuietPalette.accent)
                Image(systemName: "calendar").foregroundStyle(QuietPalette.accent)
            }
            .frame(minHeight: 44).contentShape(Rectangle())
        }
        .accessibilityLabel("Choose day")
        .accessibilityValue(day.formatted(date: .complete, time: .omitted))
        .sheet(isPresented: $presented) {
            NavigationStack {
                DatePicker("Day", selection: $day, displayedComponents: .date)
                    .datePickerStyle(.graphical).padding()
                    .navigationTitle("Choose day")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        QuietToolbarButton("Done", systemImage: "checkmark") { presented = false }
                    }
            }
            .presentationDetents([.large])
        }
    }
}
