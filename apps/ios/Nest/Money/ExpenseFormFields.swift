import SwiftUI

/// Amount first and big, then what it was for, who paid and how it's split, with a live split bar.
struct ExpenseFormFields: View {
    enum Field: Hashable {
        case description, amount, note, receiptTotal, firstExact, secondExact, firstPercentage
    }
    @Binding var draft: ExpenseDraft
    @Binding var date: Date
    let members: [MoneyBalance.Member]
    let focus: FocusState<Field?>.Binding
    var allowsReceiptTotal = true
    @Environment(\.memberPalette) private var palette
    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        Section {
            amountHero
        }
        .listRowBackground(Color.clear)
        Section {
            input("What was it for?", text: $draft.description, field: .description, label: "Description")
            if members.count == 2 {
                Picker("Paid by", selection: $draft.payer) {
                    ForEach(members.sorted { a, _ in a.actorId == palette.me }) { person in
                        Text(name(person)).tag(person.id)
                    }
                }
                .segmentedUnlessLarge(textSize.isAccessibilitySize)
                .listRowSeparator(.hidden)
            }
            DatePicker("Date", selection: $date, displayedComponents: .date)
        }
        Section {
            Picker("Split", selection: $draft.split) {
                ForEach(ExpenseDraft.Split.allCases, id: \.self) { Text(splitLabel($0)).tag($0) }
            }
            .segmentedUnlessLarge(textSize.isAccessibilitySize)
            splitInputs
            ExpenseSplitPreview(members: members, allocations: preview)
        } header: {
            Text("Split")
        } footer: {
            Text("Any half-cent rounding goes to the payer. You’ll see the exact shares before saving.")
        }
        Section("More") {
            input("Note (optional)", text: $draft.note, field: .note, label: "Note (optional)")
            if allowsReceiptTotal {
                Toggle("Receipt total differs from shared amount", isOn: $draft.separateReceiptTotal)
                if draft.separateReceiptTotal {
                    input(
                        "Receipt total (CHF)", text: $draft.receiptTotal, field: .receiptTotal,
                        label: "Receipt total (CHF)", keyboard: .decimalPad)
                }
            }
        }
    }

    private var amountHero: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("CHF").font(.system(.title2, design: .rounded, weight: .semibold)).foregroundStyle(NestColor.ink2)
            TextField("0.00", text: $draft.amount)
                .font(.system(size: 52, weight: .bold, design: .rounded))
                .monospacedDigit()
                .keyboardType(.decimalPad)
                .fixedSize()
                .focused(focus, equals: .amount)
                .accessibilityLabel("Shared amount (CHF)")
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .onAppear { if draft.amount.isEmpty { focus.wrappedValue = .amount } }
    }

    @ViewBuilder private var splitInputs: some View {
        if members.count == 2 {
            if draft.split == .exact {
                input(
                    "\(members[0].displayName)’s share (CHF)", text: $draft.firstExact, field: .firstExact,
                    label: "\(members[0].displayName)’s share (CHF)", keyboard: .decimalPad)
                input(
                    "\(members[1].displayName)’s share (CHF)", text: $draft.secondExact, field: .secondExact,
                    label: "\(members[1].displayName)’s share (CHF)", keyboard: .decimalPad)
            } else if draft.split == .percentage {
                input(
                    "\(members[0].displayName)’s percentage", text: $draft.firstPercentage,
                    field: .firstPercentage, label: "\(members[0].displayName)’s percentage", keyboard: .decimalPad)
                Text("The rest goes to \(members[1].displayName).").font(.footnote).foregroundStyle(NestColor.ink2)
            }
        }
    }

    private var preview: [ExpenseAllocation]? {
        try? draft.allocations(members: members.map(\.actorId))
    }

    private func name(_ person: MoneyBalance.Member) -> String {
        person.actorId == palette.me ? "You" : person.displayName
    }

    private func splitLabel(_ split: ExpenseDraft.Split) -> String {
        switch split {
        case .equal: "Equally"
        case .exact: "Amounts"
        case .percentage: "Percent"
        }
    }

    private func input(
        _ placeholder: String, text: Binding<String>, field: Field, label: String,
        keyboard: UIKeyboardType = .default
    ) -> some View {
        TextField(placeholder, text: text, axis: .vertical)
            .keyboardType(keyboard)
            .focused(focus, equals: field)
            .accessibilityLabel(label)
            .frame(minHeight: 32)
    }
}

/// Two coloured segments, one per person, sized by their share.
struct ExpenseSplitPreview: View {
    let members: [MoneyBalance.Member]
    let allocations: [ExpenseAllocation]?
    @Environment(\.memberPalette) private var palette

    var body: some View {
        VStack(spacing: 8) {
            GeometryReader { proxy in
                HStack(spacing: 3) {
                    ForEach(members) { person in
                        Capsule().fill(palette.color(person.actorId).color)
                            .frame(width: max(6, proxy.size.width * fraction(person.actorId) - 1.5))
                    }
                }
            }
            .frame(height: 10)
            HStack {
                ForEach(members) { person in
                    Text("\(person.actorId == palette.me ? "You" : person.displayName) \(share(person.actorId))")
                        .font(.footnote.weight(.semibold)).monospacedDigit()
                        .foregroundStyle(palette.color(person.actorId).color)
                    if person.id == members.first?.id { Spacer() }
                }
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: allocations.map { $0.map(\.centimes.value) })
        .accessibilityElement(children: .combine)
        .padding(.vertical, 4)
    }

    private var total: Int64 { allocations?.reduce(0) { $0 + $1.centimes.value } ?? 0 }

    private func fraction(_ id: UUID) -> CGFloat {
        guard let allocations, total > 0 else { return 0.5 }
        let part = allocations.first { $0.memberId == id }?.centimes.value ?? 0
        return CGFloat(part) / CGFloat(total)
    }

    private func share(_ id: UUID) -> String {
        guard let value = allocations?.first(where: { $0.memberId == id })?.centimes.value else { return "–" }
        return Centimes.chf(value).replacingOccurrences(of: "CHF ", with: "")
    }
}

extension View {
    /// Segmented when the labels fit; an inline list of choices at accessibility text sizes.
    @ViewBuilder
    func segmentedUnlessLarge(_ large: Bool) -> some View {
        if large {
            pickerStyle(.inline)
        } else {
            pickerStyle(.segmented)
        }
    }
}
