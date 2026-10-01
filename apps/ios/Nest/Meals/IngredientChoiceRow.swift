import SwiftUI

@MainActor
func ingredientChoiceBinding(
    for choice: MealIngredientChoice, choices: Binding<[MealIngredientChoice]>
) -> Binding<MealIngredientChoice> {
    Binding(
        get: { choices.wrappedValue.first(where: { $0.id == choice.id }) ?? choice },
        set: { updated in
            guard updated.id == choice.id,
                let index = choices.wrappedValue.firstIndex(where: { $0.id == choice.id })
            else { return }
            choices.wrappedValue[index] = updated
        })
}

struct IngredientChoiceRow: View {
    @Binding var choice: MealIngredientChoice
    let row: MealIngredient
    let focus: FocusState<String?>.Binding

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Toggle(row.name, isOn: $choice.selected).disabled(row.groceryItemId != nil)
                .accessibilityLabel("\(row.name), \(occurrence)")
                .accessibilityHint(row.mealTitle)
            Text("\(row.mealTitle) · \(row.date.value) · \(row.slot.label)")
                .font(.caption).foregroundStyle(QuietPalette.muted)
            if row.groceryItemId != nil {
                Text("Already added").font(.caption).foregroundStyle(QuietPalette.muted)
            } else {
                LabeledContent("Quantity") {
                    TextField("Optional", text: quantity).multilineTextAlignment(.trailing).accessibilityLabel(
                        "Quantity for \(row.name), \(occurrence)"
                    )
                    .focused(focus, equals: "\(row.entryId):\(row.ingredientId):quantity")
                    .onSubmit { focus.wrappedValue = nil }
                }
                LabeledContent("Unit") {
                    TextField("Optional", text: unit).multilineTextAlignment(.trailing).accessibilityLabel(
                        "Unit for \(row.name), \(occurrence)"
                    )
                    .focused(focus, equals: "\(row.entryId):\(row.ingredientId):unit")
                    .onSubmit { focus.wrappedValue = nil }
                }
            }
        }.padding(.vertical, 6)
    }

    private var occurrence: String { "\(row.date.value), \(row.slot.label)" }

    private var quantity: Binding<String> {
        Binding(get: { choice.ingredient.quantity ?? "" }, set: { choice.ingredient.quantity = $0.isEmpty ? nil : $0 })
    }
    private var unit: Binding<String> {
        Binding(get: { choice.ingredient.unit ?? "" }, set: { choice.ingredient.unit = $0.isEmpty ? nil : $0 })
    }
}
