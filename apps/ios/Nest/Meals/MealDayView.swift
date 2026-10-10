import SwiftUI

/// One day of the week: the date on the left, each visible meal slot as a card or a soft placeholder.
struct MealDayView<Detail: View>: View {
    @Environment(\.dynamicTypeSize) private var textSize
    let date: CivilDate
    let meals: [PlannedMeal]
    let slots: [MealSlot]
    let canChange: Bool
    var isToday = false
    let add: (MealSlot) -> Void
    let remove: (PlannedMeal) -> Void
    let replace: (PlannedMeal) -> Void
    let leftovers: (PlannedMeal) -> Void
    let move: (PlannedMeal) -> Void
    let detail: (PlannedMeal) -> Detail

    var body: some View {
        let layout =
            textSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
        layout {
            MealDayLabel(date: date, isToday: isToday)
            VStack(spacing: 8) {
                if meals.isEmpty && displaySlots.count > 1 {
                    emptyDay
                } else {
                    ForEach(displaySlots, id: \.self) { slot in
                        if let meal = meals.first(where: { $0.slot == slot }) {
                            plannedCard(meal, slot: slot)
                        } else {
                            emptySlot(slot)
                        }
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var displaySlots: [MealSlot] {
        slots + meals.map(\.slot).filter { !slots.contains($0) }
    }

    private var showsSlotNames: Bool { displaySlots.count > 1 }

    /// A day with nothing planned: one quiet row with a small button per meal slot.
    private var emptyDay: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 6) { slotButtons }
            VStack(alignment: .leading, spacing: 6) { slotButtons }
        }
        .padding(8)
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(NestColor.fill2, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
    }

    private var slotButtons: some View {
        ForEach(displaySlots, id: \.self) { slot in
            Button {
                add(slot)
            } label: {
                Label(slot.label, systemImage: "plus")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(NestColor.ink2)
                    .padding(.horizontal, 12)
                    .frame(minHeight: 44)
                    .background(NestColor.fill, in: Capsule())
            }
            .buttonStyle(NestPressStyle())
            .disabled(!canChange)
            .accessibilityLabel("\(date.value), \(slot.label): Add meal")
        }
    }

    private func emptySlot(_ slot: MealSlot) -> some View {
        Button {
            add(slot)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "plus").font(.subheadline.weight(.semibold))
                Text("Add \(slot.label.lowercased())").font(.subheadline.weight(.medium))
                Spacer(minLength: 0)
            }
            .foregroundStyle(NestColor.ink2)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(NestColor.fill2, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(NestPressStyle())
        .disabled(!canChange)
        .accessibilityLabel("\(date.value), \(slot.label): Add meal")
    }

    private func plannedCard(_ meal: PlannedMeal, slot: MealSlot) -> some View {
        HStack(spacing: 0) {
            NavigationLink {
                detail(meal)
            } label: {
                HStack(spacing: 12) {
                    EmojiTile(emoji: MealEmoji.emoji(for: meal.title), size: 46)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(meal.title).font(.body.weight(.medium)).foregroundStyle(NestColor.ink)
                            .multilineTextAlignment(.leading)
                        if showsSlotNames || meal.leftoverSourceId != nil {
                            Text(meal.leftoverSourceId == nil ? slot.label : "\(slot.label) · leftovers")
                                .font(.footnote).foregroundStyle(NestColor.ink2)
                        }
                    }
                    Spacer(minLength: 4)
                }
                .padding(.leading, 10)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(NestPressStyle())
            .accessibilityLabel("\(date.value), \(slot.label): \(meal.title), recipe details")
            Menu {
                actions(meal)
            } label: {
                Image(systemName: "ellipsis").font(.body.weight(.semibold)).foregroundStyle(NestColor.ink3)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .disabled(!canChange)
            .accessibilityLabel("\(date.value), \(slot.label): More options for \(meal.title)")
        }
        .nestCard(padding: 0, radius: 20)
        .contextMenu {
            if canChange { actions(meal) }
        }
    }

    @ViewBuilder
    private func actions(_ meal: PlannedMeal) -> some View {
        Button("Replace", systemImage: "arrow.triangle.2.circlepath") { replace(meal) }
        if meal.leftoverSourceId == nil {
            Button("Plan leftovers", systemImage: "takeoutbag.and.cup.and.straw") { leftovers(meal) }
        }
        Button("Move", systemImage: "calendar") { move(meal) }
        Button("Remove", systemImage: "trash", role: .destructive) { remove(meal) }
    }
}

/// "SAT / 10", with today's date in a filled circle.
struct MealDayLabel: View {
    let date: CivilDate
    let isToday: Bool

    var body: some View {
        VStack(spacing: 2) {
            Text(parts.weekday.uppercased())
                .font(.caption.weight(.semibold)).tracking(0.3)
                .foregroundStyle(isToday ? NestColor.accentInk : NestColor.ink3)
            Text(parts.day)
                .font(.system(isToday ? .body : .title3, design: .rounded, weight: .semibold))
                .foregroundStyle(isToday ? NestColor.onAccent : NestColor.ink)
                .frame(width: 36, height: 36)
                .background(isToday ? NestColor.accent : Color.clear, in: Circle())
        }
        .frame(width: 44)
        .padding(.top, 6)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(isToday ? "Today, \(parts.long)" : parts.long)
    }

    private var parts: (weekday: String, day: String, long: String) {
        guard let value = date.localDay(timeZone: TimeZone(secondsFromGMT: 0)!) else {
            return ("", date.value, date.value)
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let style = Date.FormatStyle(timeZone: TimeZone(secondsFromGMT: 0)!)
        return (
            value.formatted(style.weekday(.abbreviated)),
            String(calendar.component(.day, from: value)),
            value.formatted(style.weekday(.wide).day().month(.wide))
        )
    }
}
