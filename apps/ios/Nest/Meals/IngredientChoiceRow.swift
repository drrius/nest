import SwiftUI

/// One ingredient to buy: tick it to add it, untick what you already have. Quantity and unit stay editable.
struct IngredientChoiceRow: View {
    @Binding var choice: MealIngredientChoice
    let row: MealIngredient
    let focus: FocusState<String?>.Binding

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { choice.selected.toggle() }
                } label: {
                    HStack(spacing: 12) {
                        CheckCircle(isOn: choice.selected || row.groceryItemId != nil, square: true, size: 26)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(row.name)
                                .foregroundStyle(choice.selected ? NestColor.ink : NestColor.ink3)
                                .strikethrough(!choice.selected && row.groceryItemId == nil, color: NestColor.ink3)
                            Text(row.groceryItemId != nil ? "Already on the list" : "For \(row.mealTitle)")
                                .font(.footnote).foregroundStyle(NestColor.ink2).lineLimit(1)
                        }
                        Spacer(minLength: 4)
                        EmojiTile(emoji: MealEmoji.emoji(for: row.mealTitle), size: 28, domain: .neutral)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(row.groceryItemId != nil)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(row.name), \(occurrence)")
                .accessibilityValue(row.groceryItemId != nil ? "Already on the list" : "")
                .accessibilityHint(row.mealTitle)
                .accessibilityAddTraits(choice.selected ? [.isButton, .isSelected] : .isButton)
            }
            if choice.selected && row.groceryItemId == nil {
                HStack(spacing: 8) {
                    field("Qty", text: quantity, width: 74, id: "quantity", label: "Quantity")
                    field("Unit", text: unit, width: 90, id: "unit", label: "Unit")
                }
                .padding(.leading, 38)
                .transition(.opacity)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
    }

    private func field(_ placeholder: String, text: Binding<String>, width: CGFloat, id: String, label: String)
        -> some View
    {
        TextField(placeholder, text: text)
            .font(.system(.subheadline, design: .rounded))
            .multilineTextAlignment(.center)
            .frame(width: width, height: 34)
            .background(NestColor.fill, in: Capsule())
            .focused(focus, equals: "\(row.entryId):\(row.ingredientId):\(id)")
            .onSubmit { focus.wrappedValue = nil }
            .accessibilityLabel("\(label) for \(row.name), \(occurrence)")
    }

    private var occurrence: String { "\(row.date.value), \(row.slot.label)" }

    private var quantity: Binding<String> {
        Binding(get: { choice.ingredient.quantity ?? "" }, set: { choice.ingredient.quantity = $0.isEmpty ? nil : $0 })
    }
    private var unit: Binding<String> {
        Binding(get: { choice.ingredient.unit ?? "" }, set: { choice.ingredient.unit = $0.isEmpty ? nil : $0 })
    }
}
