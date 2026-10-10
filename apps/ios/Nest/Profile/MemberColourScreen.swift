import SwiftUI

/// Pick your colour. Everything that means "you" recolours as you choose; your partner's colour is taken.
struct MemberColourScreen: View {
    @EnvironmentObject private var colours: MemberColourModel
    @Environment(\.memberPalette) private var palette
    @State private var ticks = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                preview
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 16) {
                    ForEach(MemberColor.allCases, id: \.self) { swatch($0) }
                }
                Text(
                    "Saved on this iPhone. \(palette.partnerName.capitalizedFirst) picks theirs in their own settings, and you can’t both have the same one."
                )
                .font(.footnote).foregroundStyle(NestColor.ink3)
            }
            .padding(20)
        }
        .nestScreen()
        .navigationTitle("Your colour")
        .navigationBarTitleDisplayMode(.inline)
        .sensoryFeedback(.selection, trigger: ticks)
    }

    private var mine: MemberColor { palette.color(palette.me) }
    private var partnerColour: MemberColor? { palette.partner.map { palette.color($0) } }

    private var preview: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                MemberAvatar(id: palette.me, size: 56)
                VStack(alignment: .leading, spacing: 2) {
                    Text(palette.me.flatMap { palette.names[$0] } ?? "You").font(.headline)
                    Text(mine.displayName).font(.subheadline).foregroundStyle(NestColor.ink2)
                }
                Spacer()
                if palette.partner != nil { MemberAvatar(id: palette.partner, size: 36) }
            }
            HStack {
                Text("Yoga").fontWeight(.semibold)
                Text("· Personal").foregroundStyle(NestColor.ink2)
                Spacer()
            }
            .font(.subheadline)
            .padding(.horizontal, 12).frame(minHeight: 40)
            .background(mine.soft, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(alignment: .leading) { Rectangle().fill(mine.color).frame(width: 3) }
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            HStack(spacing: 3) {
                Capsule().fill(mine.color)
                Capsule().fill(partnerColour?.color ?? NestColor.fill2)
            }
            .frame(height: 10)
        }
        .nestCard(padding: 18)
        .animation(.easeInOut(duration: 0.35), value: mine)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Preview in \(mine.displayName)")
    }

    private func swatch(_ colour: MemberColor) -> some View {
        let taken = colour == partnerColour
        let selected = colour == mine
        return Button {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) { colours.choose(colour) }
            ticks += 1
        } label: {
            VStack(spacing: 6) {
                ZStack {
                    Circle().fill(colour.color).frame(width: 56, height: 56)
                    if selected {
                        Image(systemName: "checkmark").font(.title3.weight(.bold)).foregroundStyle(.white)
                            .transition(.scale.combined(with: .opacity))
                    } else if taken {
                        Text(palette.initial(palette.partner)).font(.system(.title3, design: .rounded, weight: .bold))
                            .foregroundStyle(.white)
                    }
                }
                .overlay(Circle().stroke(NestColor.ink, lineWidth: 2.5).padding(-5).opacity(selected ? 1 : 0))
                Text(taken ? palette.partnerName.capitalizedFirst : colour.displayName)
                    .font(.footnote.weight(selected ? .semibold : .regular))
                    .foregroundStyle(selected ? NestColor.ink : NestColor.ink2)
                    .lineLimit(1)
            }
            .opacity(taken ? 0.45 : 1)
        }
        .buttonStyle(NestPressStyle())
        .disabled(taken)
        .accessibilityLabel(taken ? "\(colour.displayName), \(palette.partnerName)’s colour" : colour.displayName)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// A settings row showing your current colour.
struct MemberColourRow: View {
    @Environment(\.memberPalette) private var palette

    var body: some View {
        HStack(spacing: 12) {
            Circle().fill(palette.color(palette.me).color).frame(width: 26, height: 26)
            Text("Your colour")
            Spacer()
            Text(palette.color(palette.me).displayName).foregroundStyle(NestColor.ink2)
        }
    }
}
