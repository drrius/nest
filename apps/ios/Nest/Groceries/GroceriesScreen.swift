import SwiftUI

struct GroceriesScreen: View {
    @ObservedObject var model: SessionModel
    @State private var showChecked = false

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
            content
        }
        .listStyle(.plain)
        .listSectionSpacing(.compact)
        .scrollContentBackground(.hidden)
        .background(QuietPalette.background)
        .navigationTitle("Groceries")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.refreshGroceries() }
        .task { if model.groceries == .idle { await model.refreshGroceries() } }
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
            .disabled(local.state != .open)
            .accessibilityLabel(local.item.name)
            .accessibilityValue(accessibilityValue(local))
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
