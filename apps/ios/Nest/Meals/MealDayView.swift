import SwiftUI

struct MealDayView: View {
    let date: CivilDate
    let meals: [PlannedMeal]
    let slots: [MealSlot]
    let canAdd: Bool
    let add: (MealSlot) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(dayTitle)
                .font(.title3.weight(.semibold))
                .foregroundStyle(QuietPalette.ink)
            VStack(spacing: 0) {
                ForEach(displaySlots, id: \.self) { slot in
                    if let meal = meals.first(where: { $0.slot == slot }) {
                        HStack(alignment: .firstTextBaseline, spacing: 16) {
                            Text(slot.label)
                                .frame(width: 84, alignment: .leading)
                                .foregroundStyle(QuietPalette.muted)
                            Text(meal.title).foregroundStyle(QuietPalette.ink)
                            Spacer(minLength: 0)
                        }
                        .frame(minHeight: 60, alignment: .leading)
                    } else {
                        Button {
                            add(slot)
                        } label: {
                            HStack(spacing: 16) {
                                Text(slot.label).frame(width: 84, alignment: .leading)
                                Label("Add meal", systemImage: "plus")
                                Spacer(minLength: 0)
                            }
                            .frame(minHeight: 60, alignment: .leading)
                        }
                        .disabled(!canAdd)
                        .accessibilityLabel("\(date.value), \(slot.label): Add meal")
                    }
                    if slot != displaySlots.last {
                        Divider().overlay(QuietPalette.border)
                    }
                }
            }
            .font(.subheadline)
            .foregroundStyle(QuietPalette.accent)
            .padding(.horizontal, 16)
            .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
        }
    }

    private var dayTitle: String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = .current
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        guard let value = formatter.date(from: date.value) else { return date.value }
        formatter.dateFormat = "EEEE"
        return "\(formatter.string(from: value)) · \(MealWeekScreen.label(date))"
    }

    private var displaySlots: [MealSlot] {
        slots + meals.map(\.slot).filter { !slots.contains($0) }
    }
}
