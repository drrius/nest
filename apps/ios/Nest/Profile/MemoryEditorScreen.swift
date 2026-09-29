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
                    Text("Private to you. You’ll review the exact text before saving.")
                        .font(.footnote).foregroundStyle(QuietPalette.muted)
                }
                if let notice = model.notice { Section { Text(notice) } }
                Section {
                    Button("Review text") {
                        Task {
                            await model.propose(content: content, memory: memory, session: session, member: member)
                            if model.saved != nil { dismiss() }
                        }
                    }
                    .disabled(!MemoryText.valid(content) || model.busy)
                }
            }
            .disabled(model.busy)
            .navigationTitle(memory == nil ? "New memory" : "Edit memory")
            .toolbar {
                Button("Cancel") {
                    if content != (memory?.content ?? "") { discard = true } else { dismiss() }
                }.disabled(model.busy)
            }
            .confirmationDialog("Discard your unsaved text?", isPresented: $discard) {
                Button("Discard text", role: .destructive) { dismiss() }
            }
            .interactiveDismissDisabled(model.busy || content != (memory?.content ?? ""))
        }
    }
}
