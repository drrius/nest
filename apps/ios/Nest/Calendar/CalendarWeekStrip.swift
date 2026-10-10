import SwiftUI

/// Monday-to-Sunday strip for the selected day's week. Today is tinted; the selected day is filled.
struct CalendarWeekStrip: View {
    @Binding var day: Date
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var textSize
    private let calendar: Calendar = {
        var value = Calendar(identifier: .gregorian)
        value.firstWeekday = 2
        return value
    }()

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Text(day.formatted(.dateTime.month(.wide).year())).font(.headline).foregroundStyle(NestColor.ink)
                Spacer()
                arrow("chevron.left", label: "Previous week", weeks: -1)
                arrow("chevron.right", label: "Next week", weeks: 1)
                CalendarDayPicker(day: $day)
            }
            if textSize.isAccessibilitySize {
                // Large dates can't share one screen width, so the week scrolls sideways instead of clipping.
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(week, id: \.self) { date in dayButton(date) }
                    }
                }
            } else {
                HStack(spacing: 2) {
                    ForEach(week, id: \.self) { date in dayButton(date) }
                }
            }
        }
    }

    private var week: [Date] {
        guard let start = calendar.dateInterval(of: .weekOfYear, for: day)?.start else { return [day] }
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
    }

    private func dayButton(_ date: Date) -> some View {
        let selected = calendar.isDate(date, inSameDayAs: day)
        let today = calendar.isDateInToday(date)
        return Button {
            withAnimation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.75)) { day = date }
        } label: {
            VStack(spacing: 6) {
                Text(date.formatted(.dateTime.weekday(.narrow)))
                    .font(.caption.weight(.semibold)).foregroundStyle(NestColor.ink3)
                Text(date.formatted(.dateTime.day()))
                    .font(.system(.body, design: .rounded, weight: .semibold))
                    .foregroundStyle(selected ? NestColor.onAccent : today ? NestColor.accentInk : NestColor.ink)
                    .frame(minWidth: 38, minHeight: 38)
                    .padding(textSize.isAccessibilitySize ? 8 : 0)
                    .background(selected ? NestColor.accent : Color.clear, in: Circle())
            }
            .frame(maxWidth: textSize.isAccessibilitySize ? nil : .infinity, minHeight: 64)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(date.formatted(date: .complete, time: .omitted))
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func arrow(_ symbol: String, label: String, weeks: Int) -> some View {
        Button {
            if let next = calendar.date(byAdding: .day, value: 7 * weeks, to: day) { day = next }
        } label: {
            Image(systemName: symbol).font(.subheadline.weight(.semibold)).frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(NestColor.ink2)
        .accessibilityLabel(label)
    }
}

/// Diagonal stripes for busy time that has no details.
struct HatchFill: View {
    let color: Color

    var body: some View {
        Canvas { context, size in
            var path = Path()
            var x: CGFloat = -size.height
            while x < size.width {
                path.move(to: CGPoint(x: x, y: size.height))
                path.addLine(to: CGPoint(x: x + size.height, y: 0))
                x += 9
            }
            context.stroke(path, with: .color(color.opacity(0.28)), lineWidth: 3)
        }
        .background(color.opacity(0.12))
    }
}
