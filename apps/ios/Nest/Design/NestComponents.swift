import SwiftUI

// MARK: - Surfaces

struct NestCardModifier: ViewModifier {
    var padding: CGFloat?
    var radius: CGFloat = 24

    func body(content: Content) -> some View {
        content
            .padding(padding ?? 0)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(NestColor.card, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .shadow(color: Color.black.opacity(0.045), radius: 14, x: 0, y: 8)
    }
}

extension View {
    func nestCard(padding: CGFloat? = 16, radius: CGFloat = 24) -> some View {
        modifier(NestCardModifier(padding: padding, radius: radius))
    }

    /// Paper background and readable insets for a tab or pushed screen.
    func nestScreen() -> some View {
        background(NestColor.background.ignoresSafeArea())
    }
}

/// A section title with an optional chevron (when the whole title is a link) and a trailing accessory.
struct NestSectionHeader<Trailing: View>: View {
    let title: String
    var chevron = false
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            HStack(spacing: 4) {
                Text(title).font(.title2.weight(.bold)).foregroundStyle(NestColor.ink)
                if chevron {
                    Image(systemName: "chevron.right").font(.headline.weight(.bold))
                        .foregroundStyle(NestColor.ink3).accessibilityHidden(true)
                }
            }
            .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            trailing
        }
    }
}

extension NestSectionHeader where Trailing == EmptyView {
    init(title: String, chevron: Bool = false) {
        self.init(title: title, chevron: chevron) { EmptyView() }
    }
}

/// A list surface: rows separated by inset hairlines inside one card.
struct NestRowDivider: View {
    var leading: CGFloat = 58

    var body: some View {
        NestColor.line.frame(height: 0.5).padding(.leading, leading)
    }
}

// MARK: - Tiles

struct IconTile: View {
    let systemName: String
    var domain: NestDomain = .neutral
    var size: CGFloat = 30
    var solid = false

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: size * 0.48, weight: .semibold))
            .foregroundStyle(solid ? Color.white : NestColor.tint(domain))
            .frame(width: size, height: size)
            .background(
                solid ? NestColor.tint(domain) : NestColor.tintSoft(domain),
                in: RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
            )
            .accessibilityHidden(true)
    }
}

struct EmojiTile: View {
    let emoji: String
    var size: CGFloat = 44
    var domain: NestDomain = .meal

    var body: some View {
        Text(emoji)
            .font(.system(size: size * 0.56))
            .frame(width: size, height: size)
            .background(NestColor.tintSoft(domain), in: RoundedRectangle(cornerRadius: size * 0.3, style: .continuous))
            .accessibilityHidden(true)
    }
}

// MARK: - Pills

struct NestPill: View {
    enum Tone {
        case neutral, accent, warn, good, meal
        case member(MemberColor)
    }
    let text: String
    var systemImage: String?
    var tone: Tone = .neutral

    var body: some View {
        HStack(spacing: 5) {
            if let systemImage { Image(systemName: systemImage).imageScale(.small) }
            Text(text)
        }
        .font(.caption.weight(.semibold))
        .padding(.horizontal, 9)
        .padding(.vertical, 4)
        .foregroundStyle(colors.0)
        .background(colors.1, in: Capsule())
    }

    private var colors: (Color, Color) {
        switch tone {
        case .neutral: (NestColor.ink2, NestColor.fill)
        case .accent: (NestColor.accentInk, NestColor.accentSoft)
        case .warn: (NestColor.warn, NestColor.warnSoft)
        case .good: (NestColor.good, NestColor.goodSoft)
        case .meal: (NestColor.ink, NestColor.tintSoft(.meal))
        case .member(let color): (NestColor.ink, color.soft)
        }
    }
}

// MARK: - Buttons

struct NestButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, plain }
    var kind: Kind = .primary
    var small = false
    var fullWidth = false
    @Environment(\.isEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(small ? .subheadline.weight(.semibold) : .body.weight(.semibold))
            .lineLimit(2)
            .multilineTextAlignment(.center)
            .padding(.horizontal, small ? 14 : 22)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: small ? 36 : 52)
            .foregroundStyle(foreground)
            .background(background, in: Capsule())
            .opacity(enabled ? 1 : 0.45)
            .frame(minHeight: 44)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.96 : 1)
            .animation(
                reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.6), value: configuration.isPressed
            )
            .contentShape(Capsule())
    }

    private var foreground: Color {
        switch kind {
        case .primary: NestColor.onAccent
        case .secondary: NestColor.accentInk
        case .plain: NestColor.ink
        }
    }

    private var background: Color {
        switch kind {
        case .primary: NestColor.accent
        case .secondary: NestColor.accentSoft
        case .plain: NestColor.fill2
        }
    }
}

/// Subtle press feedback for whole-card buttons and rows.
struct NestPressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .contentShape(Rectangle())
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(
                reduceMotion ? nil : .spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}
