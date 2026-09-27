import SwiftUI

struct MealDayView<Detail: View>: View {
    let date: CivilDate
    let meals: [PlannedMeal]
    let slots: [MealSlot]
    let canChange: Bool
    let add: (MealSlot) -> Void
    let remove: (PlannedMeal) -> Void
    let move: (PlannedMeal) -> Void
    let detail: (PlannedMeal) -> Detail

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(dayTitle)
                .font(.title3.weight(.semibold))
                .foregroundStyle(QuietPalette.ink)
            VStack(spacing: 0) {
                ForEach(displaySlots, id: \.self) { slot in
                    if let meal = meals.first(where: { $0.slot == slot }) {
                        plannedRow(meal, slot: slot)
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
                        .disabled(!canChange)
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

    private func plannedRow(_ meal: PlannedMeal, slot: MealSlot) -> some View {
        HStack(spacing: 12) {
            NavigationLink {
                detail(meal)
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(slot.label).font(.caption).foregroundStyle(QuietPalette.muted)
                        Text(meal.title).font(.body).foregroundStyle(QuietPalette.ink)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.caption)
                }
                .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(slot.label): \(meal.title), recipe details")
            Menu {
                Button("Move", systemImage: "arrow.right.arrow.left") { move(meal) }
                Button("Remove", systemImage: "trash", role: .destructive) { remove(meal) }
            } label: {
                Image(systemName: "ellipsis")
                    .foregroundStyle(QuietPalette.accent)
                    .frame(width: 44, height: 44)
            }
            .disabled(!canChange)
            .accessibilityLabel("More options for \(meal.title)")
        }
        .frame(minHeight: 60, alignment: .leading)
    }
}
