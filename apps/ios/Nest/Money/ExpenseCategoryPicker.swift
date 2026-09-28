import SwiftUI

struct ExpenseCategoryPicker: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @Binding var selection: UUID?
    @Binding var selectedName: String?
    @State private var categories: [MoneyCategory] = []
    @State private var next: UUID?
    @State private var loading = false
    @State private var notice: String?
    @State private var request = UUID()

    var body: some View {
        List {
            Button("No category") {
                selection = nil
                selectedName = nil
                dismiss()
            }
            ForEach(categories) { category in
                Button {
                    selection = category.id
                    selectedName = category.name
                    dismiss()
                } label: {
                    HStack {
                        Text(category.name)
                        Spacer()
                        if selection == category.id { Image(systemName: "checkmark") }
                    }
                }
            }
            if loading { ProgressView("Loading categories…") }
            if let notice { Text(notice) }
            if !loading && notice == nil && categories.isEmpty { Text("No active categories.") }
            if next != nil { Button("Load more") { Task { await load(more: true) } }.disabled(loading) }
            Button("Refresh categories") { Task { await load(more: false) } }.disabled(loading)
        }
        .navigationTitle("Category")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .task { await load(more: false) }
    }

    private func load(more: Bool) async {
        let attempt = UUID()
        request = attempt
        let cursor = more ? next : nil
        if !more {
            categories = []
            next = nil
        }
        loading = true
        notice = nil
        defer { if request == attempt { loading = false } }
        do {
            let result = try await session.readMoneyCategories(
                member: member, generation: session.generation, after: cursor)
            try Task.checkCancellation()
            guard request == attempt else { return }
            categories.append(contentsOf: result.categories)
            next = result.next
        } catch {
            guard request == attempt, !Task.isCancelled else { return }
            notice = "Could not load categories. Try again online."
        }
    }
}
