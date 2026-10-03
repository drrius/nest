import SwiftUI

struct RecurringEditorFields: View {
    @Binding var draft: RecurringDraft
    let members: [MoneyBalance.Member]
    let focus: FocusState<String?>.Binding
    var usesNativeDate = false

    var body: some View {
        Section("Rule") {
            field("Description", text: $draft.description)
            Picker("Recording", selection: $draft.mode) {
                Text("Confirm each bill").tag(RecurringConfiguration.Mode.variable)
                Text("Automatic fixed expense").tag(RecurringConfiguration.Mode.fixed)
            }
            Picker("Payer", selection: $draft.payer) {
                ForEach(members) { Text($0.displayName).tag($0.id) }
            }
            if usesNativeDate {
                DatePicker("Starts", selection: nativeStart, displayedComponents: .date)
                    .environment(\.timeZone, TimeZone(identifier: "Europe/Zurich")!)
            } else {
                field("Start date (YYYY-MM-DD)", text: $draft.startDate)
            }
            Picker("Frequency", selection: $draft.scheduleKind) {
                Text("Monthly").tag(RecurringSchedule.Kind.monthly)
                Text("Weekly").tag(RecurringSchedule.Kind.weekly)
            }.onChange(of: draft.scheduleKind) { _, _ in draft.scheduleDay = 1 }
            Picker(draft.scheduleKind == .monthly ? "Day of month" : "Weekday", selection: $draft.scheduleDay) {
                ForEach(1...(draft.scheduleKind == .monthly ? 31 : 7), id: \.self) { day in
                    Text(draft.scheduleKind == .monthly ? String(day) : weekdays[day - 1]).tag(day)
                }
            }
        }
        if draft.mode == .fixed {
            Section("Automatic amount and split") {
                field("Amount (CHF)", text: $draft.amount, keyboard: .decimalPad)
                ForEach(members) { person in
                    field(
                        "\(person.displayName) share (CHF)",
                        text: Binding(
                            get: { draft.shares[person.id] ?? "" }, set: { draft.shares[person.id] = $0 }),
                        keyboard: .decimalPad, focusKey: person.id.uuidString
                    )
                }
                Text("This amount will be recorded automatically each cycle. Nest does not make payments.").font(
                    .footnote)
            }
        }
        Section { field("Note (optional)", text: $draft.note) }
    }
    private var weekdays: [String] { ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] }
    private var nativeStart: Binding<Date> {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Europe/Zurich")
        formatter.dateFormat = "yyyy-MM-dd"
        return Binding(
            get: { formatter.date(from: draft.startDate) ?? Date() },
            set: { draft.startDate = formatter.string(from: $0) })
    }
    private func field(
        _ label: String, text: Binding<String>, keyboard: UIKeyboardType = .default, focusKey: String? = nil
    ) -> some View {
        MoneyDraftField(label: label, text: text, focus: focus, keyboard: keyboard, focusKey: focusKey)
    }
}
