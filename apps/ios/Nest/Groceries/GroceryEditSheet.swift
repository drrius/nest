import SwiftUI

struct GroceryEditSheet: View {
    @ObservedObject var model: SessionModel
    let item: GroceryItem
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var quantity: String
    @State private var unit: String
    @State private var categoryId: UUID?
    @State private var submitting = false

    init(model: SessionModel, item: GroceryItem) {
        self.model = model
        self.item = item
        _name = State(initialValue: item.name)
        _quantity = State(initialValue: item.quantity ?? "")
        _unit = State(initialValue: item.unit ?? "")
        _categoryId = State(initialValue: item.categoryId)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Item") {
                    TextField("What do you need?", text: $name)
                        .textInputAutocapitalization(.sentences)
                }
                Section("Details") {
                    TextField("Quantity (optional)", text: $quantity)
                    TextField("Unit (optional)", text: $unit)
                }
                GroceryCategoryPicker(model: model, selection: $categoryId)
                if !model.groceryCategoryAvailable(categoryId) {
                    Section {
                        Text("The previous category is unavailable. Choose another or clear it.")
                            .foregroundStyle(QuietPalette.muted)
                        Button("Clear category") { categoryId = nil }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(QuietPalette.background)
            .navigationTitle("Edit grocery")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        submitting = true
                        Task {
                            await model.editGrocery(
                                item, name: name, quantity: quantity,
                                unit: unit, categoryId: categoryId)
                            dismiss()
                        }
                    } label: {
                        if submitting { ProgressView() } else { Text("Save") }
                    }
                    .disabled(!validChanges || submitting || model.groceryEditSaving)
                }
            }
        }
        .tint(QuietPalette.accent)
        .task { await model.refreshGroceryCategories() }
    }

    private var validChanges: Bool {
        let title = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let amount = quantity.trimmingCharacters(in: .whitespacesAndNewlines)
        let measure = unit.trimmingCharacters(in: .whitespacesAndNewlines)
        let changed =
            title != item.name || (amount.isEmpty ? nil : amount) != item.quantity
            || (measure.isEmpty ? nil : measure) != item.unit || categoryId != item.categoryId
        return !title.isEmpty && name.count <= 120 && quantity.count <= 80 && unit.count <= 80
            && model.groceryCategoryAvailable(categoryId) && changed
    }
}
