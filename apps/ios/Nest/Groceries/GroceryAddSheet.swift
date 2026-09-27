import SwiftUI

struct GroceryAddSheet: View {
    @ObservedObject var model: SessionModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var quantity = ""
    @State private var unit = ""
    @State private var categoryId: UUID?
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
                GroceryCategoryPicker(model: model, selection: $categoryId)
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
                            await model.addGrocery(
                                name: name, quantity: quantity, unit: unit, categoryId: categoryId)
                            dismiss()
                        }
                    } label: {
                        if submitting { ProgressView() } else { Text("Add") }
                    }
                    .disabled(
                        name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || name.count > 120 || quantity.count > 80 || unit.count > 80
                            || !model.groceryCategoryAvailable(categoryId) || submitting
                            || model.groceryAddSaving)
                }
            }
        }
        .tint(QuietPalette.accent)
        .task { await model.refreshGroceryCategories() }
    }

}
