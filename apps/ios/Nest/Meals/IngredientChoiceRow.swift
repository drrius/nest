import SwiftUI

struct IngredientChoiceRow: View {
    @Binding var choice: MealIngredientChoice
    let row: MealIngredient

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
                        "Quantity for \(row.name), \(occurrence)")
                }
                LabeledContent("Unit") {
                    TextField("Optional", text: unit).multilineTextAlignment(.trailing).accessibilityLabel(
                        "Unit for \(row.name), \(occurrence)")
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
