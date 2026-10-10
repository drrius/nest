import SwiftUI

/// A member's initial on their chosen colour.
struct MemberAvatar: View {
    let id: UUID?
    var size: CGFloat = 28
    @Environment(\.memberPalette) private var palette

    var body: some View {
        Text(palette.initial(id))
            .font(.system(size: size * 0.44, weight: .semibold, design: .rounded))
            .foregroundStyle(Color.white)
            .frame(width: size, height: size)
            .background(palette.color(id).color, in: Circle())
            .accessibilityLabel(palette.name(id))
    }
}

/// Who a chore belongs to: one person, both of you, or taking turns.
struct AssigneeBadge: View {
    enum Kind: Equatable {
        case person(UUID)
        case shared, turns
    }
    let kind: Kind
    var size: CGFloat = 26
    @Environment(\.memberPalette) private var palette

    var body: some View {
        switch kind {
        case .person(let id):
            MemberAvatar(id: id, size: size)
        case .shared:
            HStack(spacing: -size * 0.3) {
                MemberAvatar(id: palette.me, size: size * 0.82)
                MemberAvatar(id: palette.partner, size: size * 0.82)
                    .overlay(Circle().stroke(NestColor.card, lineWidth: 2))
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Shared")
        case .turns:
            Image(systemName: "arrow.triangle.2.circlepath")
                .font(.system(size: size * 0.5, weight: .semibold))
                .foregroundStyle(NestColor.ink2)
                .frame(width: size, height: size)
                .background(NestColor.fill2, in: Circle())
                .accessibilityLabel("Taking turns")
        }
    }
}

/// The round tick used for chores and groceries. It fills with a springy pop when done.
struct CheckCircle: View {
    let isOn: Bool
    var pending = false
    var square = false
    var size: CGFloat = 28
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            shape.strokeBorder(NestColor.fill2, lineWidth: 2)
            shape.fill(NestColor.accent)
                .scaleEffect(isOn ? 1 : 0.2)
                .opacity(isOn ? 1 : 0)
            Image(systemName: pending ? "clock" : "checkmark")
                .font(.system(size: size * 0.5, weight: .bold))
                .foregroundStyle(NestColor.onAccent)
                .scaleEffect(isOn ? 1 : 0.4)
                .opacity(isOn ? 1 : 0)
        }
        .frame(width: size, height: size)
        .animation(
            reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.35, dampingFraction: 0.55), value: isOn
        )
        .accessibilityHidden(true)
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: square ? size * 0.32 : size / 2, style: .continuous)
    }
}
