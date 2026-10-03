import SwiftUI

struct GroceryEditSheet: View {
    @ObservedObject var model: SessionModel
    @Environment(\.dismiss) private var dismiss
    @State private var item: GroceryItem
    @State private var name: String
    @State private var quantity: String
    @State private var unit: String
    @State private var categoryId: UUID?
    @State private var submitting = false
    @State private var attemptedSave = false
    @State private var showingLatest = false
    @State private var reloading = false
    @State private var discardChanges = false

    init(model: SessionModel, item: GroceryItem) {
        self.model = model
        _item = State(initialValue: item)
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
                        .accessibilityLabel("Grocery name")
                }
                .disabled(fieldsLocked)
                Section("Details") {
                    TextField("Quantity (optional)", text: $quantity)
                        .accessibilityLabel("Quantity")
                    TextField("Unit (optional)", text: $unit)
                        .accessibilityLabel("Unit")
                }
                .disabled(fieldsLocked)
                GroceryCategoryPicker(model: model, selection: $categoryId)
                    .disabled(fieldsLocked)
                if !model.groceryCategoryAvailable(categoryId), model.groceryEdit == nil {
                    Section {
                        Text("The selected category is unavailable. Choose another or clear it.")
                            .foregroundStyle(QuietPalette.muted)
                        Button {
                            categoryId = nil
                        } label: {
                            QuietActionLabel("Clear category")
                        }
                        .buttonStyle(.plain)
                        .disabled(submitting || reloading)
                    }
                }
                if let saved = model.groceryEdit, saved.item.id == item.id {
                    savedRequest(saved)
                } else if attemptedSave, let notice = model.groceryWriteNotice {
                    Section {
                        Text(notice).foregroundStyle(QuietPalette.muted)
                        Button {
                            Task { await reload() }
                        } label: {
                            Text("Reload current item").frame(minHeight: 44, alignment: .leading).contentShape(
                                Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(fieldsLocked)
                    }
                }
                if showingLatest {
                    Section("Shared item now") {
                        Text(item.name)
                        let detail = [item.quantity, item.unit, item.categoryName].compactMap { $0 }
                        if !detail.isEmpty {
                            Text(detail.joined(separator: " · ")).foregroundStyle(QuietPalette.muted)
                        }
                        Text("Your entries are unchanged. Review them against this item before saving.")
                            .font(.footnote).foregroundStyle(QuietPalette.muted)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(QuietPalette.background)
            .navigationTitle("Edit grocery")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        close()
                    } label: {
                        Text(model.groceryEdit == nil ? "Cancel" : "Close")
                            .fixedSize(horizontal: true, vertical: false)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(submitting || reloading)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        submitting = true
                        attemptedSave = true
                        Task {
                            let confirmed = await model.editGrocery(
                                item, name: name, quantity: quantity,
                                unit: unit, categoryId: categoryId)
                            submitting = false
                            if confirmed { dismiss() }
                        }
                    } label: {
                        if submitting {
                            ProgressView()
                                .frame(minWidth: 44, minHeight: 44)
                                .contentShape(Rectangle())
                        } else {
                            Text("Save")
                                .fixedSize(horizontal: true, vertical: false)
                                .frame(minWidth: 44, minHeight: 44)
                                .contentShape(Rectangle())
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(!validChanges || fieldsLocked || model.groceryEditSaving)
                }
            }
            .interactiveDismissDisabled(hasEdits || fieldsLocked)
            .alert("Discard grocery edits?", isPresented: $discardChanges) {
                Button("Discard edits", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) {}
            }
        }
        .tint(QuietPalette.accent)
        .task { await model.refreshGroceryCategories() }
    }

    private var fieldsLocked: Bool { submitting || reloading || model.groceryEdit != nil }

    private var hasEdits: Bool {
        let title = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let amount = quantity.trimmingCharacters(in: .whitespacesAndNewlines)
        let measure = unit.trimmingCharacters(in: .whitespacesAndNewlines)
        return title != item.name || (amount.isEmpty ? nil : amount) != item.quantity
            || (measure.isEmpty ? nil : measure) != item.unit || categoryId != item.categoryId
    }

    private var validChanges: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && name.count <= 120 && quantity.count <= 80 && unit.count <= 80
            && model.groceryCategoryAvailable(categoryId) && hasEdits
    }

    private func close() {
        if model.groceryEdit != nil || !hasEdits {
            dismiss()
        } else {
            discardChanges = true
        }
    }

    private func reload() async {
        reloading = true
        defer { reloading = false }
        let attempt = model.generation
        guard let current = await model.reloadGroceryForEditing(item), model.generation == attempt else { return }
        item = current
        showingLatest = true
    }

    private func savedRequest(_ saved: SavedGroceryEdit) -> some View {
        Section("Saved request") {
            if saved.state == .pending {
                Text("This edit is not confirmed. Retry the same saved request when online.")
                    .foregroundStyle(QuietPalette.muted)
                Button {
                    submitting = true
                    Task {
                        let confirmed = await model.retryGroceryEdit()
                        submitting = false
                        if confirmed { dismiss() }
                    }
                } label: {
                    Text("Retry saved edit").frame(minHeight: 44, alignment: .leading).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(submitting || model.groceryEditSaving)
            } else if saved.state == .conflict {
                Text("This edit was refused. Discard the rejected request, then reload the item to review your edits.")
                    .foregroundStyle(QuietPalette.muted)
                Button {
                    submitting = true
                    Task {
                        await model.discardConflictedGroceryEdit()
                        submitting = false
                    }
                } label: {
                    Text("Discard rejected edit").frame(minHeight: 44, alignment: .leading).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(submitting)
            } else {
                Text("Updated. Refreshing the shared list.").foregroundStyle(QuietPalette.muted)
            }
        }
    }
}
