import SwiftUI

/// One device event: its times beside a colour bar and the title. At accessibility sizes the times sit above the
/// title instead of in a fixed column, so they never truncate.
struct CalendarEventRow: View {
    let event: DeviceCalendarEvent
    let day: Date
    var detail: String?
    var titleLines: Int?
    @Environment(\.memberPalette) private var palette
    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        let large = textSize.isAccessibilitySize
        let layout =
            large
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
        layout {
            times.frame(minWidth: large ? nil : 58, alignment: .leading)
            HStack(alignment: .top, spacing: 12) {
                RoundedRectangle(cornerRadius: 2).fill(palette.color(palette.me).color).frame(width: 4)
                VStack(alignment: .leading, spacing: 2) {
                    Text(event.title).font(.body.weight(.medium)).foregroundStyle(NestColor.ink).lineLimit(titleLines)
                    if let detail, !detail.isEmpty {
                        Text(detail).font(.footnote).foregroundStyle(NestColor.ink2)
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
    }

    private var times: some View {
        VStack(alignment: .leading, spacing: 1) {
            if event.allDay {
                Text("All day").font(.system(.subheadline, design: .rounded, weight: .semibold))
                    .foregroundStyle(NestColor.ink)
            } else {
                endpoint(EventTimeLabel.parts(event.start, on: day), primary: true)
                endpoint(EventTimeLabel.parts(event.end, on: day), primary: false)
            }
        }
        .monospacedDigit()
        .fixedSize(horizontal: true, vertical: false)
    }

    /// A date line appears only when the endpoint falls on another day.
    private func endpoint(_ parts: EventTimeLabel.Parts, primary: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if let date = parts.day {
                Text(date).font(.system(.caption2, design: .rounded)).foregroundStyle(NestColor.ink3)
            }
            Text(parts.time)
                .font(
                    primary
                        ? .system(.subheadline, design: .rounded, weight: .semibold)
                        : .system(.caption, design: .rounded)
                )
                .foregroundStyle(primary ? NestColor.ink : NestColor.ink3)
        }
    }
}
