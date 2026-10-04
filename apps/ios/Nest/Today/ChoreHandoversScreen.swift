import SwiftUI

struct ChoreHandoversScreen: View {
    private enum Choice: Identifiable {
        case request(NestChore, UUID)
        case respond(PendingChoreTransfer, RespondChoreTransfer.Action)

        var id: UUID {
            switch self {
            case .request(let chore, _): chore.id
            case .respond(let transfer, _): transfer.requestId
            }
        }
    }
    @ObservedObject var model: SessionModel
    @State private var context: RoutineCreateContext?
    @State private var snapshot: ChoreSnapshot?
    @State private var saved: SavedChoreTransfer?
    @State private var notice: String?
    @State private var working = false
    @State private var choice: Choice?

    var body: some View {
        List {
            if let notice { Section { Text(notice) } }
            if let saved {
                Section(saved.title) {
                    if saved.conflicted {
                        Text("This handover changed. Refresh before making another decision.")
                        Button("Review current chores") { Task { await finish() } }
                    } else if let receipt = saved.receipt {
                        Text(
                            receipt.state == "pending"
                                ? "Request sent. Your partner still needs to accept." : "Decision saved.")
                        Button("Done") { Task { await finish() } }
                    } else {
                        Text(working ? "Saving…" : "Not confirmed. Retry the saved request when online.")
                        Button("Retry saved handover") { Task { await apply(nil) } }
                    }
                }
            } else if let snapshot, let context {
                pending(snapshot, actor: context.member.userId)
                requests(snapshot, actor: context.member.userId)
            }
            Section { Button("Refresh handovers") { Task { await load() } } }
        }
        .disabled(working)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .navigationTitle("Chore handovers")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .task { await load() }
        .sheet(item: $choice) { confirmation($0) }
    }

    private func confirmation(_ selected: Choice) -> some View {
        NavigationStack {
            List {
                Section {
                    Text(confirmationMessage(selected)).fixedSize(horizontal: false, vertical: true)
                }
                Section {
                    Button {
                        choice = nil
                        Task { await apply(selected) }
                    } label: {
                        Text(confirmationAction(selected)).frame(maxWidth: .infinity, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                }
            }
            .navigationTitle("Review handover").navigationBarTitleDisplayMode(.inline)
            .scrollContentBackground(.hidden).background(QuietPalette.background)
            .safeAreaInset(edge: .bottom) {
                Button(role: .cancel) {
                    choice = nil
                } label: {
                    Text("Cancel").frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.borderless).padding().background(QuietPalette.background)
            }
        }
        .presentationDetents([.large])
    }

    private func confirmationAction(_ selected: Choice) -> String {
        switch selected {
        case .request: "Send request"
        case .respond(_, .accept): "Accept handover"
        case .respond(_, .decline): "Decline handover"
        }
    }

    private func confirmationMessage(_ selected: Choice) -> String {
        switch selected {
        case .request(let chore, _):
            "Ask your partner to take \(chore.title), due \(chore.dueDate.value). It stays assigned to you until accepted."
        case .respond(let transfer, .accept):
            "Take responsibility for \(transfer.title), due \(transfer.dueDate.value)."
        case .respond(let transfer, .decline):
            "Decline \(transfer.title). Responsibility stays with the sender."
        }
    }

    private func pending(_ page: ChoreSnapshot, actor: UUID) -> some View {
        Section("Pending handovers") {
            if page.transfers.isEmpty { Text("No handovers waiting.").foregroundStyle(QuietPalette.muted) }
            ForEach(page.transfers, id: \.requestId) { transfer in
                VStack(alignment: .leading, spacing: 8) {
                    Text(transfer.title).font(.headline)
                    Text("Due " + transfer.dueDate.value).font(.subheadline)
                    if transfer.toMemberId == actor {
                        Text("From " + name(transfer.fromMemberId, page: page)).font(.subheadline)
                        HStack {
                            Button {
                                choose(.respond(transfer, .accept))
                            } label: {
                                Text("Accept").frame(maxWidth: .infinity, minHeight: 44)
                                    .contentShape(Rectangle())
                            }
                            Button {
                                choose(.respond(transfer, .decline))
                            } label: {
                                Text("Decline").frame(maxWidth: .infinity, minHeight: 44)
                                    .contentShape(Rectangle())
                            }
                        }.buttonStyle(.borderless)
                    } else {
                        Text("Waiting for " + name(transfer.toMemberId, page: page))
                    }
                }.padding(.vertical, 6)
            }
        }
    }

    private func requests(_ page: ChoreSnapshot, actor: UUID) -> some View {
        let eligible = page.chores.filter { chore in
            chore.assigneeId == actor && !page.transfers.contains { $0.occurrenceId == chore.id }
        }
        return Section("Ask your partner") {
            if let partner = page.members.first(where: { $0.actorId != actor }) {
                if eligible.isEmpty {
                    Text("No assigned chores available to hand over.").foregroundStyle(QuietPalette.muted)
                }
                ForEach(eligible) { chore in
                    Button {
                        choose(.request(chore, partner.actorId))
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(chore.title).font(.headline)
                            Text("Ask \(partner.displayName) · due \(chore.dueDate.value)").font(.subheadline)
                        }.padding(.vertical, 6)
                    }
                }
            } else {
                Text("A second household member is needed for handovers.")
            }
        }
    }

    private func name(_ id: UUID, page: ChoreSnapshot) -> String {
        page.members.first { $0.actorId == id }?.displayName ?? "your partner"
    }

    private func choose(_ choice: Choice) {
        self.choice = choice
    }

    private func load() async {
        guard !working else { return }
        working = true
        defer { working = false }
        do {
            let current = try model.routineCreateContext()
            context = current
            saved = try await model.savedChoreTransfer(current)
            snapshot = try await model.readChangeableChores(current)
            notice = nil
        } catch { notice = "Could not refresh handovers. Saved requests are kept; try again online." }
    }

    private func apply(_ choice: Choice?) async {
        guard !working, let context else { return }
        working = true
        defer { working = false }
        do {
            if saved == nil, let choice {
                switch choice {
                case .request(let chore, let recipient):
                    try await model.stageTransferRequest(chore, recipient: recipient, context: context)
                case .respond(let pending, let action):
                    try await model.stageTransferResponse(pending, action: action, context: context)
                }
            }
            saved = try await model.savedChoreTransfer(context)
            saved = try await model.retryChoreTransfer(context)
            notice = nil
        } catch {
            saved = try? await model.savedChoreTransfer(context)
            notice = "Could not finish. Retry your saved handover, or refresh before deciding again."
        }
    }

    private func finish() async {
        guard !working, let context, let saved else { return }
        working = true
        do {
            try await model.finishChoreTransfer(context, operation: saved.command.operationId)
            self.saved = nil
            working = false
            await load()
        } catch {
            notice = "Could not finish. Your saved result is kept; try again."
            working = false
        }
    }
}
