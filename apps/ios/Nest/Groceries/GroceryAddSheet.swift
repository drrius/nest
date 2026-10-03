import SwiftUI

struct GroceryAddSheet: View {
    @ObservedObject var model: SessionModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var quantity = ""
    @State private var unit = ""
    @State private var categoryId: UUID?
    @State private var submitting = false
    @State private var attemptedSave = false

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
                .disabled(submitting || model.groceryAdd != nil)
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
                .disabled(submitting || model.groceryAdd != nil)
                GroceryCategoryPicker(model: model, selection: $categoryId)
                    .disabled(submitting || model.groceryAdd != nil)
                if categoryId != nil, !model.groceryCategoryAvailable(categoryId), model.groceryAdd == nil {
                    Section {
                        Text("The selected category is unavailable. Choose another or clear it.")
                            .foregroundStyle(QuietPalette.muted)
                        Button {
                            categoryId = nil
                        } label: {
                            QuietActionLabel("Clear category")
                        }
                        .buttonStyle(.plain)
                        .disabled(submitting)
                    }
                }
                if let saved = model.groceryAdd {
                    savedRequest(saved)
                } else if attemptedSave, let notice = model.groceryWriteNotice {
                    Section {
                        Text(notice).foregroundStyle(QuietPalette.muted)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(QuietPalette.background)
            .navigationTitle("Add grocery")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Text(model.groceryAdd == nil ? "Cancel" : "Close")
                            .fixedSize(horizontal: true, vertical: false)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(submitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        submitting = true
                        attemptedSave = true
                        Task {
                            let confirmed = await model.addGrocery(
                                name: name, quantity: quantity, unit: unit, categoryId: categoryId)
                            submitting = false
                            if confirmed { dismiss() }
                        }
                    } label: {
                        if submitting {
                            ProgressView()
                                .frame(minWidth: 44, minHeight: 44)
                                .contentShape(Rectangle())
                        } else {
                            Text("Add")
                                .fixedSize(horizontal: true, vertical: false)
                                .frame(minWidth: 44, minHeight: 44)
                                .contentShape(Rectangle())
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(
                        name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || name.count > 120 || quantity.count > 80 || unit.count > 80
                            || !model.groceryCategoryAvailable(categoryId) || submitting
                            || model.groceryAddSaving || model.groceryAdd != nil)
                }
            }
        }
        .tint(QuietPalette.accent)
        .task { await model.refreshGroceryCategories() }
    }

    private func savedRequest(_ saved: SavedGroceryAdd) -> some View {
        Section("Saved request") {
            if saved.state == .pending {
                Text("This add is not confirmed. Retry the saved request when online.")
                    .foregroundStyle(QuietPalette.muted)
                Button {
                    submitting = true
                    Task {
                        let confirmed = await model.retryGroceryAdd()
                        submitting = false
                        if confirmed { dismiss() }
                    }
                } label: {
                    Text("Retry saved add").frame(minHeight: 44, alignment: .leading).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(submitting || model.groceryAddSaving)
            } else if saved.state == .conflict {
                Text("This add was rejected. Discard the rejected request before editing and trying again.")
                    .foregroundStyle(QuietPalette.muted)
                Button {
                    Task { await model.discardConflictedGroceryAdd() }
                } label: {
                    Text("Discard unconfirmed add").frame(minHeight: 44, alignment: .leading).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                Text("Added. Refreshing the shared list.").foregroundStyle(QuietPalette.muted)
            }
        }
    }

}
