import SwiftUI

struct GroceryAddSheet: View {
    @ObservedObject var model: SessionModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var quantity = ""
    @State private var unit = ""
    @State private var submitting = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("What do you need?", text: $name)
                        .textInputAutocapitalization(.sentences)
                        .accessibilityLabel("Grocery name")
                } header: {
                    Text("Item")
                }
                Section {
                    TextField("Quantity (optional)", text: $quantity)
                        .accessibilityLabel("Quantity")
                    TextField("Unit (optional)", text: $unit)
                        .accessibilityLabel("Unit")
                } header: {
                    Text("Details")
                } footer: {
                    Text("Checking items never records an expense.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(QuietPalette.background)
            .navigationTitle("Add grocery")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        submitting = true
                        Task {
                            await model.addGrocery(name: name, quantity: quantity, unit: unit)
                            dismiss()
                        }
                    } label: {
                        if submitting { ProgressView() } else { Text("Add") }
                    }
                    .disabled(
                        name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || name.count > 120 || quantity.count > 80 || unit.count > 80
                            || submitting || model.groceryAddSaving)
                }
            }
        }
        .tint(QuietPalette.accent)
    }
}
