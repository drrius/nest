import SwiftUI

struct PrivateMemoryScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @State private var memories: [PrivateMemory] = []
    @State private var loaded = false
    @State private var notice: String?
    @State private var request = UUID()

    var body: some View {
        List {
            Section {
                Text("Only you and your private assistant can use these saved memories.")
                    .foregroundStyle(QuietPalette.muted)
            }
            if loaded {
                if memories.isEmpty {
                    Section { Text("No saved memories yet.") }
                } else {
                    Section("Saved memories") {
                        ForEach(memories) { memory in
                            Text(memory.content).textSelection(.enabled)
                        }
                    }
                }
            } else if notice == nil {
                ProgressView("Loading private memory…")
            }
            if let notice {
                Section {
                    Text(notice).foregroundStyle(QuietPalette.muted)
                    Button("Try again") { Task { await load() } }
                }
            }
        }
        .navigationTitle("Private memory")
        .scrollContentBackground(.hidden)
        .background(QuietPalette.background)
        .task(id: session.generation) { await load() }
        .refreshable { await load() }
        .onDisappear {
            request = UUID()
            memories = []
            loaded = false
        }
    }

    private func load() async {
        let current = UUID()
        request = current
        memories = []
        loaded = false
        notice = nil
        do {
            let context = try session.assistantContext()
            guard context.member == member else { throw NestAPIFailure.signedOut }
            let result = try await session.readMemories(context)
            guard request == current, session.status == .ready(member) else { return }
            memories = result.memories
            loaded = true
        } catch {
            guard request == current, session.status == .ready(member) else { return }
            notice = "Could not load private memory. Connect and try again."
        }
    }
}
