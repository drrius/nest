import SwiftUI

@main
struct QuietSpikeApp: App {
    var body: some Scene {
        WindowGroup {
            TabView {
                QuietTodayView()
                    .tabItem { Label("Today", systemImage: "house") }
                QuietMealsView()
                    .tabItem { Label("Meals", systemImage: "fork.knife") }
                QuietCalendarView()
                    .tabItem { Label("Calendar", systemImage: "calendar") }
                QuietMoneyView()
                    .tabItem { Label("Money", systemImage: "creditcard") }
            }
            .tint(QuietPalette.accent)
        }
    }
}

enum QuietPalette {
    static let background = adaptive(0xFAFBF7, 0x151E19)
    static let surface = adaptive(0xFFFFFF, 0x202D25)
    static let onAccent = adaptive(0xFAFBF7, 0x151E19)
    static let ink = adaptive(0x273A31, 0xEEF2E9)
    static let muted = adaptive(0x646E65, 0xB1BEB2)
    static let accent = adaptive(0x335D49, 0xB4D3AF)
    static let soft = adaptive(0xEAF0E6, 0x304235)
    static let hero = adaptive(0xE9EFDF, 0x304235)
    static let line = adaptive(0xDDE3D8, 0x405346)

    private static func adaptive(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            let value = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(
                red: CGFloat((value >> 16) & 0xFF) / 255,
                green: CGFloat((value >> 8) & 0xFF) / 255,
                blue: CGFloat(value & 0xFF) / 255,
                alpha: 1
            )
        })
    }
}

struct SpikeHeader: View {
    let eyebrow: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(eyebrow)
                    .font(.caption)
                    .foregroundStyle(QuietPalette.muted)
                Spacer()
                Text("JL")
                    .font(.caption)
                    .frame(width: 36, height: 36)
                    .background(QuietPalette.surface, in: Circle())
                    .accessibilityLabel("Prototype profile")
            }
            Text(title)
                .font(.system(.largeTitle, design: .default, weight: .semibold))
                .tracking(-0.8)
                .foregroundStyle(QuietPalette.ink)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(QuietPalette.muted)
        }
    }
}

struct SpikeLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption2)
            .foregroundStyle(QuietPalette.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 8)
    }
}

struct SpikeSectionTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.headline)
            .foregroundStyle(QuietPalette.ink)
            .padding(.top, 22)
    }
}

struct SpikeSecondaryScreen: View {
    let title: String
    let subtitle: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SpikeLabel(text: "Design study · fictional data")
                SpikeHeader(eyebrow: "Our household", title: title, subtitle: subtitle)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 30)
        }
        .background(QuietPalette.background)
    }
}

struct QuietMealsView: View {
    var body: some View {
        SpikeSecondaryScreen(title: "Meals", subtitle: "Good food. One less daily decision.")
    }
}

struct QuietCalendarView: View {
    var body: some View {
        SpikeSecondaryScreen(title: "Calendar", subtitle: "The shape of your day, together.")
    }
}
