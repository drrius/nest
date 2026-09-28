import SwiftUI

struct ExpenseFormFields: View {
    @Binding var draft: ExpenseDraft
    @Binding var date: Date
    let members: [MoneyBalance.Member]

    var body: some View {
        Section("Expense") {
            TextField("Description", text: $draft.description)
            TextField("Shared amount in CHF", text: $draft.amount).keyboardType(.decimalPad)
            Picker("Paid by", selection: $draft.payer) {
                ForEach(members) { person in Text(person.displayName).tag(person.id) }
            }
            DatePicker("Date", selection: $date, displayedComponents: .date)
            TextField("Note (optional)", text: $draft.note, axis: .vertical)
            Toggle("Receipt total differs from shared amount", isOn: $draft.separateReceiptTotal)
            if draft.separateReceiptTotal {
                TextField("Receipt total in CHF", text: $draft.receiptTotal).keyboardType(.decimalPad)
            }
        }
        Section("Split") {
            Picker("Split", selection: $draft.split) {
                ForEach(ExpenseDraft.Split.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            if members.count == 2 {
                if draft.split == .exact {
                    TextField("\(members[0].displayName)’s CHF share", text: $draft.firstExact).keyboardType(
                        .decimalPad)
                    TextField("\(members[1].displayName)’s CHF share", text: $draft.secondExact).keyboardType(
                        .decimalPad)
                } else if draft.split == .percentage {
                    TextField("\(members[0].displayName)’s percentage", text: $draft.firstPercentage).keyboardType(
                        .decimalPad)
                    Text("The remainder goes to \(members[1].displayName).")
                }
            }
            Text("Any half-cent rounding goes to the payer. Review the exact CHF shares before saving.")
                .font(.footnote).foregroundStyle(QuietPalette.muted)
        }
    }
}
