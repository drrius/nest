import SwiftUI

/// The balance at a glance. The see-saw tips towards whoever is owed and levels out when you're square.
struct MoneyBalanceCard: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let balance: MoneyBalance?
    let loading: Bool
    let notice: String?
    let retry: () -> Void
    @Environment(\.memberPalette) private var palette

    var body: some View {
        VStack(spacing: 0) {
            SeeSaw(left: member.userId, right: partner, tilt: tilt)
                .padding(.top, 6)
            Text(label).font(.subheadline).foregroundStyle(NestColor.ink2).padding(.top, 8)
            amount.padding(.top, 2)
            if let notice {
                Text(notice).font(.footnote).foregroundStyle(NestColor.ink2).multilineTextAlignment(.center)
                    .padding(.top, 6)
                Button("Try again", action: retry).font(.footnote.weight(.semibold)).disabled(loading)
                    .frame(minHeight: 44)
            } else {
                Text("Across your shared expenses").font(.footnote).foregroundStyle(NestColor.ink3).padding(.top, 4)
            }
            actions.padding(.top, 18)
        }
        .frame(maxWidth: .infinity)
        .nestCard(padding: 20)
        .accessibilityElement(children: .contain)
    }

    private var own: Int64? { balance?.members.first { $0.actorId == member.userId }?.centimes.value }
    private var partner: UUID? { balance?.members.first { $0.actorId != member.userId }?.actorId ?? palette.partner }
    private var partnerName: String {
        balance?.members.first { $0.actorId != member.userId }?.displayName ?? palette.partnerName
    }

    private var tilt: Double {
        guard let own, own != 0 else { return 0 }
        return own > 0 ? -7 : 7
    }

    private var label: String {
        guard let own else { return loading ? "Loading your balance…" : "Balance" }
        if own == 0 { return "Nothing owed either way" }
        return own > 0 ? "\(partnerName) owes you" : "You owe \(partnerName)"
    }

    @ViewBuilder private var amount: some View {
        if let own, own != 0 {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("CHF").font(.system(.title2, design: .rounded, weight: .semibold)).foregroundStyle(NestColor.ink2)
                Text(Centimes.chf(abs(own)).replacingOccurrences(of: "CHF ", with: ""))
                    .font(.system(size: 50, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .foregroundStyle(NestColor.ink)
            }
            .minimumScaleFactor(0.6)
            .lineLimit(1)
            .accessibilityElement(children: .combine)
        } else if own == 0 {
            Label("All square", systemImage: "checkmark.circle.fill")
                .font(.system(.title, design: .rounded, weight: .bold))
                .foregroundStyle(NestColor.good)
        } else if loading {
            ProgressView().frame(height: 56)
        }
    }

    private var actions: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) {
                expense
                settle
            }
            VStack(spacing: 10) {
                expense
                settle
            }
        }
    }

    private var expense: some View {
        NavigationLink {
            ExpenseScreen(session: session, member: member).id(session.generation)
        } label: {
            Label("Expense", systemImage: "plus")
        }
        .buttonStyle(NestButtonStyle(kind: .primary, fullWidth: true))
        .accessibilityLabel("Add expense")
    }

    private var settle: some View {
        NavigationLink {
            SettlementScreen(session: session, member: member).id(session.generation)
        } label: {
            Label("Settle up", systemImage: "arrow.left.arrow.right")
        }
        .buttonStyle(NestButtonStyle(kind: .secondary, fullWidth: true))
        .accessibilityLabel("Record a payment")
    }
}

/// Two avatars on a beam. Decorative: the label above says the same in words.
struct SeeSaw: View {
    let left: UUID?
    let right: UUID?
    let tilt: Double
    @State private var shown = 0.0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack(alignment: .bottom) {
            Triangle().fill(NestColor.ink3).frame(width: 22, height: 18)
            ZStack {
                Capsule().fill(NestColor.ink3).frame(height: 4)
                HStack {
                    MemberAvatar(id: left, size: 42).offset(y: -23)
                    Spacer()
                    MemberAvatar(id: right, size: 42).offset(y: -23)
                }
                .shadow(color: .black.opacity(0.15), radius: 5, y: 3)
            }
            .frame(width: 210)
            .rotationEffect(.degrees(shown))
            .padding(.bottom, 17)
        }
        .frame(height: 76)
        .accessibilityHidden(true)
        .onAppear { settle(to: tilt) }
        .onChange(of: tilt) { _, value in settle(to: value) }
    }

    private func settle(to value: Double) {
        guard !reduceMotion else {
            shown = value
            return
        }
        withAnimation(.spring(response: 0.9, dampingFraction: 0.45)) { shown = value }
    }
}

private struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        Path { path in
            path.move(to: CGPoint(x: rect.midX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
            path.closeSubpath()
        }
    }
}

/// Who pays whom, with dots that drift from payer to recipient.
struct SettleHero: View {
    let payer: UUID
    let recipient: UUID
    let amount: Int64
    @Environment(\.memberPalette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase = false

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 14) {
                MemberAvatar(id: payer, size: 54)
                HStack(spacing: 6) {
                    ForEach(0..<5, id: \.self) { index in
                        Circle().fill(NestColor.accent).frame(width: 7, height: 7)
                            .opacity(phase ? 1 : 0.2)
                            .animation(
                                reduceMotion
                                    ? nil : .easeInOut(duration: 0.7).repeatForever().delay(Double(index) * 0.12),
                                value: phase)
                    }
                }
                MemberAvatar(id: recipient, size: 54)
            }
            Text(sentence).font(.subheadline).foregroundStyle(NestColor.ink2)
            Text(Centimes.chf(amount))
                .font(.system(size: 40, weight: .bold, design: .rounded)).monospacedDigit()
                .foregroundStyle(NestColor.ink)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .onAppear { phase = true }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(sentence), \(Centimes.chf(amount))")
    }

    private var sentence: String {
        let from = palette.name(payer)
        let to = palette.name(recipient)
        if from == "You" { return "You pay \(to)" }
        return to == "You" ? "\(from) pays you" : "\(from) pays \(to)"
    }
}
