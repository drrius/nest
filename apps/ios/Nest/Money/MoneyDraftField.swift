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
    var review: (() -> Void)? = nil
    var reviewLabel = "Review"
    var reviewIdentifier = "money-draft.keyboard-review"

    func body(content: Content) -> some View {
        content.toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                if let review {
                    done
                    Spacer()
                    Button {
                        focus.wrappedValue = nil
                        review()
                    } label: {
                        Text("Review").fixedSize().frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(reviewLabel)
                    .accessibilityIdentifier(reviewIdentifier)
                } else {
                    Spacer()
                    done
                }
            }
        }
    }

    private var done: some View {
        Button {
            focus.wrappedValue = nil
        } label: {
            Text("Done").fixedSize().frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
