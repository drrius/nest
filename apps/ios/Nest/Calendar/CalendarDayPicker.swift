import SwiftUI

struct CalendarDayPicker: View {
    @Binding var day: Date
    @State private var presented = false

    var body: some View {
        Button {
            presented = true
        } label: {
            Image(systemName: "calendar").font(.body.weight(.semibold))
                .frame(width: 40, height: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(NestColor.accentInk)
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
