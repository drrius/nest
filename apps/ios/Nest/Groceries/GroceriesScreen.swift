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

    @State private var quickText = ""
    @State private var ticks = 0
    @FocusState private var quickFocused: Bool

    var body: some View {
        List {
            Section {
                quickAdd
                if let notice = model.groceryNotice { noticeRow(notice) }
            }
            if let pending = model.groceryAdd { addStatus(pending) }
            if let pending = model.groceryEdit { editStatus(pending) }
            if let pending = model.groceryRemove { removeStatus(pending) }
            content
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(14)
        .scrollContentBackground(.hidden)
        .nestScreen()
        .animation(.spring(response: 0.4, dampingFraction: 0.86), value: model.groceries)
        .sensoryFeedback(.selection, trigger: ticks)
        .navigationTitle("Groceries")
        .navigationBarTitleDisplayMode(.large)
        .toolbar { toolbar }
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

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        if case .ready(let member) = model.status {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink {
                    ExpenseScreen(session: model, member: member)
                } label: {
                    Label("Record grocery expense", systemImage: "receipt")
                }
                .accessibilityHint("Enter the receipt total, shared amount, payer and split.")
            }
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                showingAdd = true
            } label: {
                Label("Add grocery", systemImage: "plus")
            }
            .disabled(model.groceryAdd != nil)
        }
    }

    private var quickAdd: some View {
        HStack(spacing: 12) {
            Image(systemName: "plus").font(.subheadline.weight(.bold)).foregroundStyle(NestColor.onAccent)
                .frame(width: 28, height: 28).background(NestColor.accent, in: Circle())
                .accessibilityHidden(true)
            TextField("Add an item", text: $quickText)
                .submitLabel(.done)
                .focused($quickFocused)
                .onSubmit { Task { await quickSubmit() } }
                .disabled(model.groceryAdd != nil || model.groceryAddSaving)
                .accessibilityLabel("Add a grocery item")
                .accessibilityHint("Type a name, like 2 avocados, then press return.")
        }
        .frame(minHeight: 48)
    }

    private func quickSubmit() async {
        guard let entry = GroceryQuickEntry.parse(quickText) else { return }
        let confirmed = await model.addGrocery(name: entry.name, quantity: entry.quantity, unit: entry.unit)
        if confirmed || model.groceryAdd != nil { quickText = "" }
        quickFocused = true
    }

    @ViewBuilder
    private var content: some View {
        switch model.groceries {
        case .idle, .loading:
            Section { ProgressView("Loading groceries…").frame(maxWidth: .infinity) }
        case .failed:
            Section {
                Text("Couldn’t load groceries.").foregroundStyle(NestColor.ink)
                Button("Try again") { Task { await model.refreshGroceries() } }
            }
        case .loaded(let state):
            loaded(state)
        }
    }

    @ViewBuilder
    private func loaded(_ state: GroceryOfflineState) -> some View {
        let saved = state.items.filter { $0.state != .open }
        let open = state.items.filter { $0.state == .open && !$0.checked }
        let checked = state.items.filter { $0.state == .open && $0.checked }
        if !saved.isEmpty {
            Section("Saved on this iPhone") { ForEach(saved) { row($0) } }
        }
        if open.isEmpty {
            Section {
                Label("Nothing left to get", systemImage: "checkmark.circle")
                    .foregroundStyle(NestColor.good)
            }
        }
        let aisles = GroceryAisles.group(open)
        ForEach(aisles, id: \.name) { aisle in
            Section(aisles.count == 1 && aisle.name == "Other" ? "To get" : aisle.name) {
                ForEach(aisle.items) { row($0) }
            }
        }
        if !checked.isEmpty {
            Section {
                DisclosureGroup(isExpanded: $showChecked) {
                    ForEach(checked) { row($0) }
                } label: {
                    Label("In the basket · \(checked.count)", systemImage: "basket")
                        .foregroundStyle(NestColor.ink)
                }
                .accessibilityLabel("Picked up · \(checked.count)")
            }
        }
    }

    private func noticeRow(_ notice: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "icloud.slash").foregroundStyle(NestColor.ink2)
            Text(notice).font(.footnote).foregroundStyle(NestColor.ink2)
            Spacer(minLength: 4)
            Button("Retry") { Task { await model.refreshGroceries() } }
                .font(.footnote.weight(.semibold))
                .accessibilityLabel("Retry sync")
        }
    }

    private func row(_ local: LocalGrocery) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Button {
                ticks += 1
                Task { await model.checkGrocery(local.item, checked: !local.checked) }
            } label: {
                GroceryRowLabel(local: local)
            }
            .buttonStyle(.plain)
            .disabled(
                local.state != .open || model.groceryEdit?.item.id == local.id
                    || model.groceryRemove?.item.id == local.id
            )
            .accessibilityLabel(local.item.name)
            .accessibilityValue(accessibilityValue(local))
            .accessibilityHint(local.checked ? "Mark as still to pick up." : "Mark as picked up.")
            if local.state != .open { savedState(local) }
        }
        .swipeActions(edge: .trailing) {
            if local.state == .open {
                Button("Remove", systemImage: "trash", role: .destructive) {
                    removalCandidate = local.item
                    showingRemoveConfirmation = true
                }
                Button("Edit", systemImage: "pencil") { editingItem = local.item }.tint(NestColor.ink2)
            }
        }
        .contextMenu {
            if local.state == .open {
                Button("Edit", systemImage: "pencil") { editingItem = local.item }
                Button("Reminder choices", systemImage: "bell") { remindingItem = local.item }
                Button("Remove", systemImage: "trash", role: .destructive) {
                    removalCandidate = local.item
                    showingRemoveConfirmation = true
                }
            }
        }
    }

    @ViewBuilder
    private func savedState(_ local: LocalGrocery) -> some View {
        switch local.state {
        case .pending:
            Text("Saved on device · waiting to sync")
                .font(.caption).foregroundStyle(NestColor.ink2)
        case .acknowledged:
            Text("Confirmed · refreshing list")
                .font(.caption).foregroundStyle(NestColor.ink2)
        case .conflict:
            Text("Needs review")
                .font(.caption.weight(.medium)).foregroundStyle(NestColor.ink)
            if let requested = local.requestedChecked {
                Text("Saved change: \(requested ? "Picked up" : "To pick up")")
                    .font(.caption).foregroundStyle(NestColor.ink2)
            }
            Text(conflictExplanation(local))
                .font(.caption).foregroundStyle(NestColor.ink2)
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
