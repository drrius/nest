import SwiftUI

/// The week header, the "plan with Nest" invitation and the seven days, with past days folded away.
struct MealWeekHeader: View {
    let start: MealWeekStart?
    let canGoBack: Bool
    let canGoForward: Bool
    let move: (Int) -> Void

    var body: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.title3.weight(.semibold)).foregroundStyle(NestColor.ink)
                if let range { Text(range).font(.footnote).foregroundStyle(NestColor.ink2) }
            }
            .accessibilityElement(children: .combine)
            Spacer()
            HStack(spacing: 0) {
                arrow("chevron.left", label: "Previous week", enabled: canGoBack) { move(-1) }
                arrow("chevron.right", label: "Next week", enabled: canGoForward) { move(1) }
            }
            .background(NestColor.card, in: Capsule())
            .shadow(color: .black.opacity(0.05), radius: 8, y: 4)
        }
    }

    private func arrow(_ symbol: String, label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.body.weight(.semibold))
                .frame(width: 46, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(NestPressStyle())
        .foregroundStyle(enabled ? NestColor.ink : NestColor.ink3)
        .disabled(!enabled)
        .accessibilityLabel(label)
    }

    private var title: String {
        guard let start, let current = try? MealWeekStart.current() else { return "This week" }
        if start == current { return "This week" }
        if let next = try? current.adjacent(1), start == next { return "Next week" }
        if let last = try? current.adjacent(-1), start == last { return "Last week" }
        return "Week of \(MealWeekScreen.label(start.date))"
    }

    private var range: String? {
        guard let start, let last = start.days.last else { return nil }
        return "\(MealWeekScreen.label(start.date)) – \(MealWeekScreen.label(last))"
    }
}

/// Invites a plan when the week has open slots. Nothing is saved until the proposal is approved.
struct MealPlanInvite: View {
    let openSlots: Int
    let totalSlots: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            NestPill(
                text: openSlots == totalSlots ? "Nothing planned yet" : "\(openSlots) open", systemImage: "sparkles",
                tone: .meal)
            Text(openSlots == totalSlots ? "Plan the week with Nest" : "Fill the gaps with Nest")
                .font(.title2.weight(.bold)).foregroundStyle(NestColor.ink)
                .padding(.top, 12)
            Text("Suggestions from your favourites, with a few new ideas. Nothing’s saved until you say so.")
                .font(.subheadline).foregroundStyle(NestColor.ink2)
                .padding(.top, 6)
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                Text("Plan with Nest")
            }
            .font(.body.weight(.semibold))
            .foregroundStyle(NestColor.onAccent)
            .padding(.horizontal, 22)
            .frame(minHeight: 50)
            .background(NestColor.accent, in: Capsule())
            .padding(.top, 18)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [NestColor.card, NestColor.tintSoft(.meal).opacity(0.7)], startPoint: .topLeading,
                endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 24, style: .continuous)
        )
        .shadow(color: .black.opacity(0.045), radius: 14, y: 8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Plan the week with AI")
    }
}

/// Earlier days of the current week, folded into one row of emoji until expanded.
struct MealPastDaysRow: View {
    let days: [CivilDate]
    let meals: [PlannedMeal]
    @Binding var expanded: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button {
            withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.85)) { expanded.toggle() }
        } label: {
            HStack(spacing: 12) {
                HStack(spacing: -10) {
                    ForEach(Array(meals.prefix(5).enumerated()), id: \.offset) { _, meal in
                        EmojiTile(emoji: MealEmoji.emoji(for: meal.title), size: 34)
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(NestColor.card, lineWidth: 2.5))
                    }
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(rangeLabel).font(.subheadline.weight(.medium)).foregroundStyle(NestColor.ink)
                    Text(meals.isEmpty ? "Nothing planned" : meals.count == 1 ? "1 meal" : "\(meals.count) meals")
                        .font(.footnote).foregroundStyle(NestColor.ink2)
                }
                Spacer()
                Image(systemName: "chevron.down").font(.footnote.weight(.bold)).foregroundStyle(NestColor.ink3)
                    .rotationEffect(.degrees(expanded ? 180 : 0))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .nestCard(padding: 0, radius: 20)
        }
        .buttonStyle(NestPressStyle())
        .accessibilityLabel("Earlier this week, \(meals.isEmpty ? "nothing planned" : "\(meals.count) meals")")
        .accessibilityHint(expanded ? "Hides earlier days" : "Shows earlier days")
    }

    private var rangeLabel: String {
        guard let first = days.first, let last = days.last else { return "Earlier" }
        let style = Date.FormatStyle(timeZone: TimeZone(secondsFromGMT: 0)!).weekday(.abbreviated)
        let a = first.localDay(timeZone: TimeZone(secondsFromGMT: 0)!)?.formatted(style) ?? first.value
        let b = last.localDay(timeZone: TimeZone(secondsFromGMT: 0)!)?.formatted(style) ?? last.value
        return first == last ? a : "\(a) – \(b)"
    }
}
