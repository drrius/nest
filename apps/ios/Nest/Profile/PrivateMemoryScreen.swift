import SwiftUI

private struct MemoryEditorTarget: Identifiable {
    let id = UUID()
    let memory: PrivateMemory?
}

struct PrivateMemoryScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    var approvalId: UUID? = nil
    @StateObject private var model = PrivateMemoryModel()
    @State private var editor: MemoryEditorTarget?
    @State private var removal: PrivateMemory?
    @State private var confirmRemoval = false

    var body: some View {
        List {
            Section {
                Text("Only you and your private assistant can use these saved memories.")
                    .foregroundStyle(QuietPalette.muted)
            }
            if let saved = model.saved {
                MemoryRequestSection(model: model, session: session, member: member, saved: saved)
            }
            if model.loaded {
                Section("Saved memories") {
                    if model.memories.isEmpty { Text("No saved memories yet.") }
                    ForEach(model.memories) { memory in
                        VStack(alignment: .leading, spacing: 12) {
                            Text(memory.content).textSelection(.enabled)
                            HStack {
                                Button("Edit") { editor = MemoryEditorTarget(memory: memory) }
                                Button("Remove", role: .destructive) {
                                    removal = memory
                                    confirmRemoval = true
                                }
                            }
                            .buttonStyle(.bordered)
                            .disabled(model.saved != nil)
                        }
                    }
                }
            }
            if model.busy { ProgressView("Checking private memory…") }
            if let notice = model.notice {
                Section {
                    Text(notice).foregroundStyle(QuietPalette.muted)
                    Button("Reload") { Task { await model.load(session: session, member: member, approvalId: approvalId) } }
                }
            }
        }
        .disabled(model.busy)
        .navigationTitle("Private memory")
        .scrollContentBackground(.hidden)
        .background(QuietPalette.background)
        .toolbar {
            Button("Add") { editor = MemoryEditorTarget(memory: nil) }
                .disabled(model.busy || !model.loaded || model.saved != nil)
        }
        .task(id: session.generation) { await model.load(session: session, member: member, approvalId: approvalId) }
        .refreshable { await model.load(session: session, member: member, approvalId: approvalId) }
        .sheet(item: $editor) { target in
            MemoryEditorScreen(model: model, session: session, member: member, memory: target.memory)
        }
        .confirmationDialog("Remove this saved memory?", isPresented: $confirmRemoval) {
            Button("Remove memory", role: .destructive) {
                if let removal { Task { await model.remove(removal, session: session, member: member) } }
            }
        } message: {
            Text("\(removal?.content ?? "")\n\nYour separate conversation and approval history will remain.")
        }
    }
}
