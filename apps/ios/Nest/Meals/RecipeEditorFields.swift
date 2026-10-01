import SwiftUI

struct RecipeDraftField: View {
    let label: String
    @Binding var text: String
    let key: String
    let focus: FocusState<String?>.Binding
    var keyboard: UIKeyboardType = .default
    var axis: Axis = .horizontal
    var lines: ClosedRange<Int> = 1...4

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption).foregroundStyle(QuietPalette.muted)
                .fixedSize(horizontal: false, vertical: true)
            TextField(label, text: $text, axis: axis)
                .lineLimit(lines)
                .keyboardType(keyboard)
                .focused(focus, equals: key)
                .accessibilityLabel(label)
        }.padding(.vertical, 4)
    }
}

struct RecipeEditorKeyboard: ViewModifier {
    let focus: FocusState<String?>.Binding

    func body(content: Content) -> some View {
        content.scrollDismissesKeyboard(.interactively).toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focus.wrappedValue = nil }.frame(minHeight: 44)
            }
        }
    }
}

struct RecipeIngredientEditor: View {
    @Binding var value: RecipeIngredientFields
    let position: Int
    let focus: FocusState<String?>.Binding
    let remove: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            field("name", text: $value.name)
            field("quantity (optional)", text: $value.quantity)
            field("unit (optional)", text: $value.unit)
            field("note (optional)", text: $value.note, axis: .vertical)
            Button(role: .destructive, action: remove) {
                Text("Remove ingredient")
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Remove ingredient \(position): \(value.name.isEmpty ? "unnamed" : value.name)")
        }.padding(.vertical, 8)
    }

    private func field(_ purpose: String, text: Binding<String>, axis: Axis = .horizontal) -> some View {
        RecipeDraftField(
            label: "Ingredient \(position) \(purpose)", text: text, key: "\(value.id):\(purpose)",
            focus: focus, axis: axis)
    }
}

struct RecipeEditIngredientRow: View {
    @Binding var value: RecipeEditIngredient
    let position: Int
    let focus: FocusState<String?>.Binding

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            field("name", text: $value.name)
            field("quantity (optional)", text: $value.quantity)
            field("unit (optional)", text: $value.unit)
            field("note (optional)", text: $value.note, axis: .vertical)
        }.padding(.vertical, 8)
    }

    private func field(_ purpose: String, text: Binding<String>, axis: Axis = .horizontal) -> some View {
        RecipeDraftField(
            label: "Ingredient \(position) \(purpose)", text: text, key: "\(value.id):\(purpose)",
            focus: focus, axis: axis)
    }
}
