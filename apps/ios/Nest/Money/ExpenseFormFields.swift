import SwiftUI

struct ExpenseFormFields: View {
    @Binding var draft: ExpenseDraft
    @Binding var date: Date
    let members: [MoneyBalance.Member]

    var body: some View {
        Section("Expense") {
            input("Description", text: $draft.description)
            input("Shared amount (CHF)", text: $draft.amount, keyboard: .decimalPad)
            Picker("Paid by", selection: $draft.payer) {
                ForEach(members) { person in Text(person.displayName).tag(person.id) }
            }
            DatePicker("Date", selection: $date, displayedComponents: .date)
            input("Note (optional)", text: $draft.note)
            Toggle("Receipt total differs from shared amount", isOn: $draft.separateReceiptTotal)
            if draft.separateReceiptTotal {
                input("Receipt total (CHF)", text: $draft.receiptTotal, keyboard: .decimalPad)
            }
        }
        Section("Split") {
            Picker("Split", selection: $draft.split) {
                ForEach(ExpenseDraft.Split.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            if members.count == 2 {
                if draft.split == .exact {
                    input("\(members[0].displayName)’s share (CHF)", text: $draft.firstExact, keyboard: .decimalPad)
                    input("\(members[1].displayName)’s share (CHF)", text: $draft.secondExact, keyboard: .decimalPad)
                } else if draft.split == .percentage {
                    input("\(members[0].displayName)’s percentage", text: $draft.firstPercentage, keyboard: .decimalPad)
                    Text("The remainder goes to \(members[1].displayName).")
                }
            }
            Text("Any half-cent rounding goes to the payer. Review the exact CHF shares before saving.")
                .font(.footnote).foregroundStyle(QuietPalette.muted)
        }
    }
    private func input(_ label: String, text: Binding<String>, keyboard: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption).foregroundStyle(QuietPalette.muted)
            TextField(label, text: text, axis: .vertical)
                .keyboardType(keyboard)
                .accessibilityLabel(label)
        }.padding(.vertical, 4)
    }

}
