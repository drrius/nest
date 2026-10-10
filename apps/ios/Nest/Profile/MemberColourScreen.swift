import SwiftUI

/// Pick your colour. Everything that means "you" recolours as you choose; your partner's colour is taken.
struct MemberColourScreen: View {
    @EnvironmentObject private var colours: MemberColourModel
    @Environment(\.memberPalette) private var palette
    @State private var ticks = 0
    @Environment(\.dynamicTypeSize) private var textSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                preview
                LazyVGrid(
                    columns: Array(
                        repeating: GridItem(.flexible(), spacing: 8), count: textSize.isAccessibilitySize ? 2 : 4),
                    spacing: 16
                ) {
                    ForEach(MemberColor.allCases, id: \.self) { swatch($0) }
                }
                if let notice = colours.notice {
                    Label(message(notice), systemImage: "exclamationmark.circle")
                        .font(.footnote.weight(.medium)).foregroundStyle(NestColor.warn)
                        .transition(.opacity)
                }
                Text(
                    "\(palette.partnerName.capitalizedFirst) sees your colour too and picks their own, so you’re never the same."
                )
                .font(.footnote).foregroundStyle(NestColor.ink3)
            }
            .padding(20)
            .animation(.easeInOut(duration: 0.25), value: colours.notice)
        }
        .nestScreen()
        .navigationTitle("Your colour")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if colours.saving { ToolbarItem(placement: .topBarTrailing) { ProgressView() } }
        }
        .sensoryFeedback(.selection, trigger: ticks)
        .sensoryFeedback(.warning, trigger: colours.notice) { _, notice in notice != nil }
        .task { await colours.refresh() }
    }

    private func message(_ notice: MemberColourModel.Notice) -> String {
        switch notice {
        case .taken: "\(palette.partnerName.capitalizedFirst) just took that colour. Pick another."
        case .changedElsewhere: "Your colour changed on another device. Pick again if you like."
        case .failed: "Couldn’t save your colour. Try again when you’re online."
        }
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
            (Text("Yoga").fontWeight(.semibold) + Text(" · Personal").foregroundStyle(NestColor.ink2))
                .frame(maxWidth: .infinity, alignment: .leading)
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
            withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.35, dampingFraction: 0.6)) {
                _ = colours.choose(colour)
            }
            ticks += 1
        } label: {
            VStack(spacing: 6) {
                ZStack {
                    Circle().fill(colour.color).frame(width: 56, height: 56)
                    if selected {
                        Image(systemName: "checkmark").font(.title3.weight(.bold)).foregroundStyle(colour.onColor)
                            .transition(reduceMotion ? .opacity : .scale.combined(with: .opacity))
                    } else if taken {
                        Text(palette.initial(palette.partner)).font(.system(.title3, design: .rounded, weight: .bold))
                            .foregroundStyle(colour.onColor)
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
        .disabled(taken || colours.saving)
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
