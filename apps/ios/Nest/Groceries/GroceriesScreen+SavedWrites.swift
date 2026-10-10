import SwiftUI

extension GroceriesScreen {
    func addStatus(_ saved: SavedGroceryAdd) -> some View {
        QuietFormSection("Add to the list") {
            VStack(alignment: .leading, spacing: 8) {
                Text(saved.command.name)
                    .font(.headline)
                    .foregroundStyle(QuietPalette.ink)
                Text(addStatusText(saved.state))
                    .font(.subheadline)
                    .foregroundStyle(QuietPalette.muted)
                if saved.state == .pending {
                    Button {
                        Task { await model.retryGroceryAdd() }
                    } label: {
                        Text("Retry saved add").frame(minHeight: 44, alignment: .leading).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(model.groceryAddSaving)
                }
                if saved.state == .conflict {
                    Button {
                        Task { await model.discardConflictedGroceryAdd() }
                    } label: {
                        Text("Discard unconfirmed add").frame(minHeight: 44, alignment: .leading).contentShape(
                            Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .listRowBackground(QuietPalette.background)
    }

    private func addStatusText(_ state: SavedGroceryAdd.State) -> String {
        switch state {
        case .pending: "Not confirmed. Retry the same saved request when online."
        case .acknowledged: "Added. Refreshing the shared list."
        case .conflict: "This add was rejected. Check the shared list before trying again."
        }
    }

    func editStatus(_ saved: SavedGroceryEdit) -> some View {
        QuietFormSection("Edit to review") {
            VStack(alignment: .leading, spacing: 8) {
                Text("\(saved.item.name) → \(saved.command.name)")
                    .font(.headline)
                    .foregroundStyle(QuietPalette.ink)
                if let detail = editDetail(saved) {
                    Text(detail).font(.subheadline).foregroundStyle(QuietPalette.muted)
                }
                Text(editStatusText(saved.state))
                    .font(.subheadline)
                    .foregroundStyle(QuietPalette.muted)
                if saved.state == .pending {
                    Button {
                        Task { await model.retryGroceryEdit() }
                    } label: {
                        Text("Retry saved edit").frame(minHeight: 44, alignment: .leading).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(model.groceryEditSaving)
                }
                if saved.state == .conflict {
                    Button {
                        Task { await model.discardConflictedGroceryEdit() }
                    } label: {
                        Text("Discard rejected edit").frame(minHeight: 44, alignment: .leading).contentShape(
                            Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .listRowBackground(QuietPalette.background)
    }

    private func editStatusText(_ state: SavedGroceryEdit.State) -> String {
        switch state {
        case .pending: "Not confirmed. Retry the same saved request when online."
        case .acknowledged: "Updated. Refreshing the shared list."
        case .conflict: "Another change won. Review the current item before editing again."
        }
    }

    private func editDetail(_ saved: SavedGroceryEdit) -> String? {
        let command = saved.command
        let amount = [command.quantity, command.unit].compactMap { $0 }.joined(separator: " ")
        let removedAmount =
            command.quantity == nil && command.unit == nil
            && (saved.item.quantity != nil || saved.item.unit != nil)
        let categoryChanged = command.categoryId != saved.item.categoryId
        let category =
            categoryChanged
            ? (command.categoryId == nil ? "No category" : "Category changed") : nil
        let detail = [removedAmount ? "No quantity" : (amount.isEmpty ? nil : amount), category].compactMap { $0 }
            .joined(separator: " · ")
        return detail.isEmpty ? nil : detail
    }

    func removeStatus(_ saved: SavedGroceryRemove) -> some View {
        QuietFormSection("Removal to review") {
            VStack(alignment: .leading, spacing: 8) {
                Text(saved.item.name).font(.headline).foregroundStyle(QuietPalette.ink)
                Text(removeStatusText(saved.state))
                    .font(.subheadline).foregroundStyle(QuietPalette.muted)
                if saved.state == .pending {
                    Button {
                        Task { await model.retryGroceryRemove() }
                    } label: {
                        Text("Retry saved removal").frame(minHeight: 44, alignment: .leading).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(model.groceryRemoveSaving)
                }
                if saved.state == .conflict {
                    Button {
                        Task { await model.discardConflictedGroceryRemove() }
                    } label: {
                        Text("Discard rejected removal").frame(minHeight: 44, alignment: .leading).contentShape(
                            Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .listRowBackground(QuietPalette.background)
    }

    private func removeStatusText(_ state: SavedGroceryRemove.State) -> String {
        switch state {
        case .pending: "Not confirmed. Retry the same saved request when online."
        case .acknowledged: "Removed. Refreshing the shared list."
        case .conflict: "Another change won. Review the current item before removing again."
        }
    }

}
