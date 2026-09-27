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
                categorySection
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
                            || !categorySelectionValid || submitting || model.groceryAddSaving)
                }
            }
        }
        .tint(QuietPalette.accent)
        .task { await model.refreshGroceryCategories() }
    }

    @ViewBuilder
    private var categorySection: some View {
        switch model.groceryCategoryStatus {
        case .idle, .loading:
            Section { ProgressView("Loading categories…") }
        case .loaded(let categories):
            if !categories.isEmpty {
                Section("Category") {
                    Picker("Category", selection: $categoryId) {
                        Text("None").tag(Optional<UUID>.none)
                        ForEach(categories) { category in
                            Text(category.name).tag(Optional(category.id))
                        }
                    }
                }
            }
        case .failed:
            Section("Category") {
                Text("Categories unavailable. You can add without one.")
                    .foregroundStyle(QuietPalette.muted)
                Button("Retry categories") {
                    Task { await model.refreshGroceryCategories() }
                }
            }
        }
    }

    private var categorySelectionValid: Bool {
        guard let categoryId else { return true }
        guard case .loaded(let categories) = model.groceryCategoryStatus else { return false }
        return categories.contains { $0.id == categoryId }
    }
}
