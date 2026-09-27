import SwiftUI

struct MealAddSheet: View {
    @ObservedObject var model: SessionModel
    let target: MealSlotTarget
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var saving = false
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("What are you having?", text: $title)
                        .textInputAutocapitalization(.sentences)
                        .submitLabel(.done)
                    if let errorText {
                        Text(errorText).font(.caption).foregroundStyle(QuietPalette.muted)
                    }
                } header: {
                    Text("\(target.slot.label) · \(target.date.value)")
                } footer: {
                    Text("Shared with your household · up to 120 characters.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(QuietPalette.background)
            .navigationTitle("Add meal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saving = true
                        Task {
                            let accepted = await model.placeMeal(
                                date: target.date, slot: target.slot, title: title)
                            if accepted {
                                dismiss()
                            } else {
                                errorText = model.mealNotice ?? "Could not save this meal. Try again."
                                saving = false
                            }
                        }
                    }
                    .disabled(saving || model.mealPlacement != nil || !validTitle)
                }
            }
        }
    }

    private var validTitle: Bool {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && trimmed.unicodeScalars.count <= 120
    }
}
