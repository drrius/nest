import SwiftUI

struct GroceriesScreen: View {
    @ObservedObject var model: SessionModel
    @State private var showChecked = false
    @State private var showingAdd = false
    @State private var editingItem: GroceryItem?

    var body: some View {
        List {
            Section {
                Text("Things to pick up, all in one place.")
                    .font(.subheadline)
                    .foregroundStyle(QuietPalette.muted)
                    .listRowSeparator(.hidden)
                if let notice = model.groceryNotice { noticeRow(notice) }
            }
            .listRowBackground(QuietPalette.background)
            if let pending = model.groceryAdd { addStatus(pending) }
            if let pending = model.groceryEdit { editStatus(pending) }
            content
        }
        .listStyle(.plain)
        .listSectionSpacing(.compact)
        .scrollContentBackground(.hidden)
        .background(QuietPalette.background)
        .navigationTitle("Groceries")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingAdd = true
                } label: {
                    Label("Add grocery", systemImage: "plus")
                }
                .disabled(model.groceryAdd != nil)
            }
        }
        .sheet(isPresented: $showingAdd) { GroceryAddSheet(model: model) }
        .sheet(item: $editingItem) { item in GroceryEditSheet(model: model, item: item) }
        .refreshable { await model.refreshGroceries() }
        .task { if model.groceries == .idle { await model.refreshGroceries() } }
    }

    private func addStatus(_ saved: SavedGroceryAdd) -> some View {
        Section("Add to the list") {
            VStack(alignment: .leading, spacing: 8) {
                Text(saved.command.name)
                    .font(.headline)
                    .foregroundStyle(QuietPalette.ink)
                Text(addStatusText(saved.state))
                    .font(.subheadline)
                    .foregroundStyle(QuietPalette.muted)
                if saved.state == .pending {
                    Button("Retry saved add") { Task { await model.retryGroceryAdd() } }
                        .disabled(model.groceryAddSaving)
                        .frame(minHeight: 44, alignment: .leading)
                }
                if saved.state == .conflict {
                    Button("Discard unconfirmed add") {
                        Task { await model.discardConflictedGroceryAdd() }
                    }
                    .frame(minHeight: 44, alignment: .leading)
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

    private func editStatus(_ saved: SavedGroceryEdit) -> some View {
        Section("Edit to review") {
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
                    Button("Retry saved edit") { Task { await model.retryGroceryEdit() } }
                        .disabled(model.groceryEditSaving)
                        .frame(minHeight: 44, alignment: .leading)
                }
                if saved.state == .conflict {
                    Button("Discard rejected edit") {
                        Task { await model.discardConflictedGroceryEdit() }
                    }
                    .frame(minHeight: 44, alignment: .leading)
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
        return [removedAmount ? "No quantity" : amount.nilIfEmpty, category].compactMap { $0 }
            .joined(separator: " · ").nilIfEmpty
    }

    @ViewBuilder
    private var content: some View {
        switch model.groceries {
        case .idle, .loading:
            Section { ProgressView("Loading groceries…") }
                .listRowBackground(QuietPalette.background)
        case .failed:
            Section {
                Text("Could not load groceries. Try again online.")
                    .foregroundStyle(QuietPalette.muted)
                Button("Retry") { Task { await model.refreshGroceries() } }
                    .frame(minHeight: 44)
            }
            .listRowBackground(QuietPalette.background)
        case .loaded(let state):
            let saved = state.items.filter { $0.state != .open }
            let open = state.items.filter { $0.state == .open && !$0.checked }
            let checked = state.items.filter { $0.state == .open && $0.checked }
            if !saved.isEmpty {
                Section("Saved changes") {
                    ForEach(saved) { row($0) }
                }
                .listRowBackground(QuietPalette.background)
            }
            Section("To pick up") {
                if open.isEmpty {
                    Text("Nothing on the list right now.")
                        .foregroundStyle(QuietPalette.muted)
                }
                ForEach(open) { row($0) }
            }
            .listRowBackground(QuietPalette.background)
            if !checked.isEmpty {
                Section {
                    DisclosureGroup("Picked up · \(checked.count)", isExpanded: $showChecked) {
                        ForEach(checked) { row($0) }
                    }
                    .foregroundStyle(QuietPalette.ink)
                }
                .listRowBackground(QuietPalette.background)
            }
        }
    }

    private func noticeRow(_ notice: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(notice)
                .font(.subheadline)
                .foregroundStyle(QuietPalette.muted)
            Button("Retry sync") { Task { await model.refreshGroceries() } }
                .font(.subheadline.weight(.medium))
                .frame(minHeight: 44, alignment: .leading)
        }
        .listRowSeparator(.hidden)
    }

    private func row(_ local: LocalGrocery) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
                Button {
                    Task { await model.checkGrocery(local.item, checked: !local.checked) }
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: local.checked ? "checkmark.circle.fill" : "circle")
                            .font(.title3)
                            .foregroundStyle(QuietPalette.accent)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(local.item.name)
                                .foregroundStyle(QuietPalette.ink)
                            if let detail = itemDetail(local.item) {
                                Text(detail).font(.caption).foregroundStyle(QuietPalette.muted)
                            }
                        }
                        Spacer(minLength: 8)
                    }
                    .frame(minHeight: 56)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(local.state != .open || model.groceryEdit?.item.id == local.id)
                .accessibilityLabel(local.item.name)
                .accessibilityValue(accessibilityValue(local))
                if local.state == .open {
                    Menu {
                        Button("Edit", systemImage: "pencil") { editingItem = local.item }
                    } label: {
                        Image(systemName: "ellipsis")
                            .foregroundStyle(QuietPalette.accent)
                            .frame(width: 44, height: 44)
                    }
                    .disabled(model.groceryEdit != nil)
                    .accessibilityLabel("Edit \(local.item.name)")
                }
            }
            if local.state != .open { savedState(local) }
        }
    }

    @ViewBuilder
    private func savedState(_ local: LocalGrocery) -> some View {
        switch local.state {
        case .pending:
            Text("Saved on device · waiting to sync")
                .font(.caption).foregroundStyle(QuietPalette.muted)
        case .acknowledged:
            Text("Confirmed · refreshing list")
                .font(.caption).foregroundStyle(QuietPalette.muted)
        case .conflict:
            Text("Needs review · change was not applied")
                .font(.caption).foregroundStyle(QuietPalette.muted)
            if let operation = local.operationId {
                Button("Discard saved change") {
                    Task { await model.discardGroceryCheck(operation) }
                }
                .font(.caption.weight(.medium))
                .frame(minHeight: 44, alignment: .leading)
            }
        case .open: EmptyView()
        }
    }

    private func itemDetail(_ item: GroceryItem) -> String? {
        let amount = [item.quantity, item.unit].compactMap { $0 }.joined(separator: " ")
        return [amount.isEmpty ? nil : amount, item.categoryName].compactMap { $0 }.joined(separator: " · ")
            .nilIfEmpty
    }

    private func accessibilityValue(_ local: LocalGrocery) -> String {
        let current = local.checked ? "Picked up" : "To pick up"
        return local.state == .open ? current : "\(current), \(local.state.rawValue)"
    }
}

extension String {
    fileprivate var nilIfEmpty: String? { isEmpty ? nil : self }
}
