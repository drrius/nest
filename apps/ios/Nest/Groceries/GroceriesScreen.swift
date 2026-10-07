import SwiftUI

struct GroceriesScreen: View {
    @ObservedObject var model: SessionModel
    let refreshOnOpen: Bool
    @State private var showChecked = false
    @State private var showingAdd = false
    @State private var editingItem: GroceryItem?
    @State private var remindingItem: GroceryItem?
    @State private var removalCandidate: GroceryItem?
    @State private var showingRemoveConfirmation = false

    init(model: SessionModel, initiallyAdding: Bool = false, refreshOnOpen: Bool = false) {
        self.model = model
        self.refreshOnOpen = refreshOnOpen
        _showingAdd = State(initialValue: initiallyAdding && model.groceryAdd == nil)
    }

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
            if case .ready(let member) = model.status {
                Section {
                    NavigationLink {
                        ExpenseScreen(session: model, member: member)
                    } label: {
                        Label("Record grocery expense", systemImage: "creditcard")
                            .frame(minHeight: 44, alignment: .leading)
                    }
                    .accessibilityHint("Enter the receipt total, shared amount, payer and split.")
                }
                .listRowBackground(QuietPalette.background)
            }
            if let pending = model.groceryAdd { addStatus(pending) }
            if let pending = model.groceryEdit { editStatus(pending) }
            if let pending = model.groceryRemove { removeStatus(pending) }
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
        .sheet(item: $remindingItem) { item in
            if case .ready(let member) = model.status {
                NavigationStack {
                    GroceryReminderScreen(session: model, member: member, itemId: item.id).id(model.generation)
                }
            }
        }
        .confirmationDialog(
            "Remove grocery?", isPresented: $showingRemoveConfirmation,
            presenting: removalCandidate
        ) { item in
            Button("Remove \(item.name)", role: .destructive) {
                Task { await model.removeGrocery(item) }
            }
        } message: { item in
            Text("\(item.name) will leave the shared list.")
        }
        .refreshable { await model.refreshGroceries() }
        .task { if refreshOnOpen || model.groceries == .idle { await model.refreshGroceries() } }
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
                Button {
                    Task { await model.refreshGroceries() }
                } label: {
                    QuietActionLabel("Retry")
                }
                .buttonStyle(.plain)
            }
            .listRowBackground(QuietPalette.background)
        case .loaded(let state):
            let saved = state.items.filter { $0.state != .open }
            let open = state.items.filter { $0.state == .open && !$0.checked }
            let checked = state.items.filter { $0.state == .open && $0.checked }
            if !saved.isEmpty {
                QuietFormSection("Saved changes") {
                    ForEach(saved) { row($0) }
                }
                .listRowBackground(QuietPalette.background)
            }
            QuietFormSection("To pick up") {
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
            Button {
                Task { await model.refreshGroceries() }
            } label: {
                Text("Retry sync").frame(minHeight: 44, alignment: .leading).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .font(.subheadline.weight(.medium))
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
                .disabled(
                    local.state != .open || model.groceryEdit?.item.id == local.id
                        || model.groceryRemove?.item.id == local.id
                )
                .accessibilityLabel(local.item.name)
                .accessibilityValue(accessibilityValue(local))
                .accessibilityHint(local.checked ? "Mark as still to pick up." : "Mark as picked up.")
                if local.state == .open {
                    Menu {
                        Button("Edit", systemImage: "pencil") { editingItem = local.item }
                        Button("Reminder choices", systemImage: "bell") { remindingItem = local.item }
                        Button("Remove", systemImage: "trash", role: .destructive) {
                            removalCandidate = local.item
                            showingRemoveConfirmation = true
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                            .foregroundStyle(QuietPalette.accent)
                            .frame(width: 44, height: 44)
                    }
                    .disabled(model.groceryEdit != nil || model.groceryRemove != nil)
                    .accessibilityLabel("More options for \(local.item.name)")
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
            Text("Needs review")
                .font(.caption.weight(.medium)).foregroundStyle(QuietPalette.ink)
            if let requested = local.requestedChecked {
                Text("Saved change: \(requested ? "Picked up" : "To pick up")")
                    .font(.caption).foregroundStyle(QuietPalette.muted)
            }
            Text(conflictExplanation(local))
                .font(.caption).foregroundStyle(QuietPalette.muted)
            Button {
                Task { await model.refreshGroceries() }
            } label: {
                Text("Refresh shared list").frame(minHeight: 44, alignment: .leading).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .font(.caption.weight(.medium))
            if let operation = local.operationId {
                Button {
                    Task { await model.discardGroceryCheck(operation) }
                } label: {
                    Text("Discard saved change").frame(minHeight: 44, alignment: .leading).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .font(.caption.weight(.medium))
            }
        case .open: EmptyView()
        }
    }

    private func conflictExplanation(_ local: LocalGrocery) -> String {
        switch local.conflictReason {
        case .removed:
            "This item was removed from the shared list. Your change was not applied."
        case .forbidden:
            "Your access to this item changed. Your change was not applied."
        case .cutover:
            "The list changed while this request was saved. Review the shared list before trying again."
        case .changed:
            "Shared list when last loaded: \(local.item.checked ? "Picked up" : "To pick up"). Your change was not applied."
        case .unknown, .none:
            "This change could not be applied. Refresh the shared list before discarding it."
        }
    }

    private func itemDetail(_ item: GroceryItem) -> String? {
        let amount = [item.quantity, item.unit].compactMap { $0 }.joined(separator: " ")
        return [amount.isEmpty ? nil : amount, item.categoryName].compactMap { $0 }.joined(separator: " · ")
            .nilIfEmpty
    }

    private func accessibilityValue(_ local: LocalGrocery) -> String {
        let current = local.checked ? "Picked up" : "To pick up"
        let sync =
            switch local.state {
            case .open: nil as String?
            case .pending: "Saved on device, waiting to sync"
            case .acknowledged: "Confirmed, refreshing list"
            case .conflict: "Needs review"
            }
        return [itemDetail(local.item), current, sync].compactMap { $0 }.joined(separator: ", ")
    }
}

extension String {
    fileprivate var nilIfEmpty: String? { isEmpty ? nil : self }
}
