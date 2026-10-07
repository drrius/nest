import SwiftUI

struct GroceryCategoryPicker: View {
    @ObservedObject var model: SessionModel
    @Binding var selection: UUID?

    var body: some View {
        switch model.groceryCategoryStatus {
        case .idle, .loading:
            Section { ProgressView("Loading categories…") }
        case .loaded(let categories):
            if !categories.isEmpty {
                QuietFormSection("Category") {
                    Picker("Category", selection: $selection) {
                        Text("None").tag(Optional<UUID>.none)
                        ForEach(categories) { category in
                            Text(category.name).tag(Optional(category.id))
                        }
                    }
                }
            }
        case .failed:
            QuietFormSection("Category") {
                Text("Categories unavailable. You can save without one.")
                    .foregroundStyle(QuietPalette.muted)
                Button("Retry categories") {
                    Task { await model.refreshGroceryCategories() }
                }
            }
        }
    }
}
