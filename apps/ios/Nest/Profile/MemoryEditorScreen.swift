import SwiftUI

struct MemoryEditorScreen: View {
    @ObservedObject var model: PrivateMemoryModel
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let memory: PrivateMemory?
    @State private var content: String
    @State private var discard = false
    @Environment(\.dismiss) private var dismiss

    init(model: PrivateMemoryModel, session: SessionModel, member: VerifiedMember, memory: PrivateMemory?) {
        self.model = model
        self.session = session
        self.member = member
        self.memory = memory
        _content = State(initialValue: memory?.content ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("What should Nest remember?", text: $content, axis: .vertical).lineLimit(4...10)
                        .accessibilityLabel("Memory text")
                    Text("Private to you. You’ll review the exact text before saving.")
                        .font(.footnote).foregroundStyle(QuietPalette.muted)
                }
                if let notice = model.notice { Section { Text(notice) } }
                Section {
                    Button {
                        Task { await review() }
                    } label: {
                        QuietActionLabel("Review text")
                    }
                    .disabled(!MemoryText.valid(content) || model.busy)
                }
            }
            .disabled(model.busy)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(memory == nil ? "New memory" : "Edit memory")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        if content != (memory?.content ?? "") { discard = true } else { dismiss() }
                    } label: {
                        Text("Cancel").fixedSize().frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                    }.buttonStyle(.plain).disabled(model.busy)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button {
                        Task { await review() }
                    } label: {
                        Text("Review").fixedSize().frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Review memory text")
                    .disabled(!MemoryText.valid(content) || model.busy)
                }
            }
            .alert("Discard text?", isPresented: $discard) {
                Button("Discard", role: .destructive) { dismiss() }
                Button("Cancel", role: .cancel) {}
            }
            .interactiveDismissDisabled(model.busy || content != (memory?.content ?? ""))
        }
    }

    private func review() async {
        await model.propose(content: content, memory: memory, session: session, member: member)
        if model.saved != nil { dismiss() }
    }
}
