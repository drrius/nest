import SwiftUI

struct MoneyDraftField: View {
    let label: String
    @Binding var text: String
    let focus: FocusState<String?>.Binding
    var keyboard: UIKeyboardType = .default
    var focusKey: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.caption).foregroundStyle(QuietPalette.muted)
                .lineLimit(nil).fixedSize(horizontal: false, vertical: true)
            TextField(label, text: $text, axis: .vertical)
                .keyboardType(keyboard)
                .focused(focus, equals: focusKey ?? label)
                .accessibilityLabel(label)
        }.padding(.vertical, 4)
    }
}

struct MoneyDraftKeyboard: ViewModifier {
    let focus: FocusState<String?>.Binding

    func body(content: Content) -> some View {
        content.toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focus.wrappedValue = nil }
                    .frame(minHeight: 44)
            }
        }
    }
}
