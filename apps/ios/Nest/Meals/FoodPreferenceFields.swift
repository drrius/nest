import SwiftUI

struct FoodPreferenceFields: View {
    @Binding var preferences: FoodPreferences
    @Binding var calorieGoal: String

    var body: some View {
        Section("Dietary restrictions") {
            ForEach(preferences.restrictions.indices, id: \.self) { index in
                TextField("Restriction", text: $preferences.restrictions[index])
            }.onDelete { preferences.restrictions.remove(atOffsets: $0) }
            Button("Add restriction", systemImage: "plus") { preferences.restrictions.append("") }
                .disabled(preferences.restrictions.count >= 32)
        }
        Section("Dislikes") {
            ForEach(preferences.dislikes.indices, id: \.self) { index in
                TextField("Dislike", text: $preferences.dislikes[index])
            }.onDelete { preferences.dislikes.remove(atOffsets: $0) }
            Button("Add dislike", systemImage: "plus") { preferences.dislikes.append("") }
                .disabled(preferences.dislikes.count >= 32)
        }
        Section("Portions") {
            Picker("Your portion", selection: $preferences.portions) {
                ForEach([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4], id: \.self) { value in
                    Text(value.formatted()).tag(value)
                }
            }
        }
        Section("Optional calorie goal") {
            LabeledContent("Daily calories") {
                TextField("Not set", text: $calorieGoal).keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing).accessibilityLabel("Optional daily calorie goal")
            }
            Text("Used for meal estimates and portions, not calorie tracking. Leave blank to skip.")
                .font(.footnote).foregroundStyle(QuietPalette.muted)
        }
    }
}
