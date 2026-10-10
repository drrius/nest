import SwiftUI

struct ExpenseFormFields: View {
    enum Field: Hashable {
        case description, amount, note, receiptTotal, firstExact, secondExact, firstPercentage
    }
    @Binding var draft: ExpenseDraft
    @Binding var date: Date
    let members: [MoneyBalance.Member]
    let focus: FocusState<Field?>.Binding
    var allowsReceiptTotal = true

    var body: some View {
        QuietFormSection("Expense") {
            input("Description", text: $draft.description, field: .description)
            input("Shared amount (CHF)", text: $draft.amount, field: .amount, keyboard: .decimalPad)
            Picker("Paid by", selection: $draft.payer) {
                ForEach(members) { person in Text(person.displayName).tag(person.id) }
            }
            .pickerStyle(.navigationLink)
            DatePicker("Date", selection: $date, displayedComponents: .date)
            input("Note (optional)", text: $draft.note, field: .note)
            if allowsReceiptTotal {
                Toggle("Receipt total differs from shared amount", isOn: $draft.separateReceiptTotal)
            }
            if allowsReceiptTotal && draft.separateReceiptTotal {
                input("Receipt total (CHF)", text: $draft.receiptTotal, field: .receiptTotal, keyboard: .decimalPad)
            }
        }
        QuietFormSection("Split") {
            Picker("Split", selection: $draft.split) {
                ForEach(ExpenseDraft.Split.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.navigationLink)
            if members.count == 2 {
                if draft.split == .exact {
                    input(
                        "\(members[0].displayName)’s share (CHF)", text: $draft.firstExact, field: .firstExact,
                        keyboard: .decimalPad)
                    input(
                        "\(members[1].displayName)’s share (CHF)", text: $draft.secondExact, field: .secondExact,
                        keyboard: .decimalPad)
                } else if draft.split == .percentage {
                    input(
                        "\(members[0].displayName)’s percentage", text: $draft.firstPercentage, field: .firstPercentage,
                        keyboard: .decimalPad)
                    Text("The remainder goes to \(members[1].displayName).")
                }
            }
            Text("Any half-cent rounding goes to the payer. Review the exact CHF shares before saving.")
                .font(.footnote).foregroundStyle(QuietPalette.muted)
        }
    }
    private func input(_ label: String, text: Binding<String>, field: Field, keyboard: UIKeyboardType = .default)
        -> some View
    {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption).foregroundStyle(QuietPalette.muted)
                .lineLimit(nil).fixedSize(horizontal: false, vertical: true)
            TextField(label, text: text, axis: .vertical)
                .keyboardType(keyboard)
                .focused(focus, equals: field)
                .accessibilityLabel(label)
        }.padding(.vertical, 4)
    }

}
